import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error, sanitizeHtml } from '@/src/lib/api-helpers';
import { isRateLimited, getClientIp } from '@/src/lib/rate-limit';
import { dissolveCutoffIso } from '@/src/lib/events';

export async function GET(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 'events:get', 60)) return error('Too many requests', 429);
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const db = getServiceClient();

  // Fetch events without FK join (no REFERENCES constraint on events table)
  const { data: events } = await db.from('events')
    .select('*')
    .gt('end_datetime', dissolveCutoffIso())
    .order('start_datetime', { ascending: true });

  // Batch-fetch creator user data
  const creatorIds = Array.from(new Set((events || []).map((e: Record<string, unknown>) => e.creator_user_id as string)));
  const userMap: Record<string, Record<string, unknown>> = {};
  if (creatorIds.length > 0) {
    const { data: users } = await db.from('users').select('id, name, is_deleted, is_active').in('id', creatorIds);
    for (const u of (users || [])) {
      const rec = u as Record<string, unknown>;
      userMap[rec.id as string] = rec;
    }
  }

  const now = new Date();
  const graceMs = 24 * 60 * 60 * 1000;

  const filtered = await Promise.all((events || []).map(async (evt: Record<string, unknown>) => {
    const endTime = new Date(evt.end_datetime as string).getTime();
    if (now.getTime() > endTime + graceMs) return null; // fully expired

    const { count: memberCount } = await db.from('event_members').select('*', { count: 'exact', head: true }).eq('event_id', evt.id);
    const { data: membership } = await db.from('event_members').select('id').eq('event_id', evt.id).eq('user_id', userId).maybeSingle();

    if (membership) return null; // already joined

    const u = userMap[evt.creator_user_id as string] || null;
    return {
      ...evt,
      creator_name: u?.name || null,
      creator_is_deleted: u?.is_deleted ?? null,
      creator_is_active: u?.is_active ?? null,
      current_members: memberCount || 0,
      is_joined: false,
      is_creator: evt.creator_user_id === userId,
      is_expired: now.getTime() > endTime,
    };
  }));

  return json(filtered.filter(Boolean));
}

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 'events:post', 20)) return error('Too many requests', 429);
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const db = getServiceClient();

  const { data: caller } = await db.from('users').select('is_active, name, room_number').eq('id', userId).single();
  if (!caller || caller.is_active === 0) return error('Your account has been deactivated', 403);

  const body = await request.json().catch(() => ({}));
  const { name, description, location, start_datetime, end_datetime, max_members, image_url } = body;

  if (!name?.trim() || !start_datetime || !end_datetime) return error('Missing required fields', 400);
  if (name.length > 100) return error('Event name cannot exceed 100 characters', 400);
  if (description && description.length > 1000) return error('Description cannot exceed 1000 characters', 400);
  if (location && location.length > 200) return error('Location cannot exceed 200 characters', 400);
  if (max_members > 50) return error('Max members cannot exceed 50', 400);

  const start = new Date(start_datetime);
  const end = new Date(end_datetime);
  const now = new Date();
  if (start < now) return error('Start time must be in the future', 400);
  if (end <= start) return error('End time must be after start time', 400);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 5) return error('Event duration cannot exceed 5 days', 400);
  const diffFromNow = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (diffFromNow > 1) return error('Event cannot be more than 1 month in the future', 400);

  // Max 3 active events per user
  const { count } = await db.from('events').select('*', { count: 'exact', head: true }).eq('creator_user_id', userId);
  if ((count || 0) >= 3) return error('You can only have 3 active events at a time', 400);

  const { data: evt } = await db.from('events').insert({
    name: sanitizeHtml(name), description: description ? sanitizeHtml(description) : null,
    location: location ? sanitizeHtml(location) : null,
    start_datetime, end_datetime, max_members: max_members || 10,
    image_url: image_url || null, creator_user_id: userId,
  }).select().single();

  // Auto-join creator
  await db.from('event_members').insert({ event_id: evt.id, user_id: userId, is_admin: 1 });

  // Post event card in main chat so it appears as a card
  const { data: chatMsg } = await db.from('messages').insert({
    user_id: userId,
    content: `${caller.name} invited you to ${sanitizeHtml(name)}`,
    group_id: 'main',
    event_id: evt.id,
  }).select('id').single();

  // Update event with message_id
  if (chatMsg?.id) {
    await db.from('events').update({ message_id: chatMsg.id }).eq('id', evt.id);
  }

  // Notify all other active users (activity type)
  const { data: allUsers } = await db.from('users').select('id').eq('is_active', 1).eq('is_deleted', false).neq('id', userId);
  for (const u of (allUsers || [])) {
    await db.from('notifications').insert({
      user_id: (u as { id: string }).id,
      type: 'activity',
      message_id: chatMsg?.id || null,
      mentioned_by_user_id: userId,
    });
  }

  return json({ ...evt, message_id: chatMsg?.id || null }, 201);
}
