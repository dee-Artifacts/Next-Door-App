import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { touchEventCard } from '@/src/lib/message-touch';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const eventId = parseInt(id);

  const { data: caller } = await db.from('users').select('is_active').eq('id', userId).single();
  if (!caller || caller.is_active === 0 || caller.is_active === false) return error('Your account has been deactivated', 403);

  // Check event exists and is not expired
  const { data: evt } = await db.from('events').select('id, max_members').eq('id', eventId).gt('end_datetime', new Date().toISOString()).maybeSingle();
  if (!evt) return error('Event not found or has ended', 400);

  const { count: memberCount } = await db.from('event_members').select('*', { count: 'exact', head: true }).eq('event_id', eventId);
  if ((memberCount || 0) >= evt.max_members) return error('Event is full', 400);

  // Check already joined - return success silently to avoid 400 on duplicate clicks
  const { data: existing } = await db.from('event_members').select('id').eq('event_id', eventId).eq('user_id', userId).maybeSingle();
  if (existing) return json({ success: true, already_member: true });

  await db.from('event_members').insert({ event_id: eventId, user_id: userId, is_admin: 0 });
  await touchEventCard(db, eventId);

  // Create join message in event chat
  const { data: user } = await db.from('users').select('name, room_number').eq('id', userId).single();
  if (user) {
    await db.from('event_messages').insert({
      event_id: eventId, user_id: userId,
      content: `joined_event:${user.name}:${user.room_number || ''}`,
    });
  }

  return json({ success: true });
}
