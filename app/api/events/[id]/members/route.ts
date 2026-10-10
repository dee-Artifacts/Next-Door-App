import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { isEventDissolved } from '@/src/lib/events';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const eventId = parseInt(id);

  const { data: caller } = await db.from('users').select('is_active').eq('id', userId).single();
  if (!caller || caller.is_active === 0 || caller.is_active === false) return error('Your account has been deactivated', 403);

  // Check membership
  const { data: membership } = await db.from('event_members').select('id').eq('event_id', eventId).eq('user_id', userId).maybeSingle();
  if (!membership) return error('Not a member of this event', 403);

  // Fetch event to get creator
  const { data: evt } = await db.from('events').select('creator_user_id, end_datetime').eq('id', eventId).maybeSingle();
  if (!evt || isEventDissolved(evt.end_datetime)) return error('This event has ended', 404);

  // Fetch all members
  const { data: rawMembers } = await db
    .from('event_members')
    .select('user_id, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (!rawMembers?.length) return json({ members: [] });

  // Batch-fetch user data
  const memberUserIds = Array.from(new Set(rawMembers.map((m: Record<string, unknown>) => m.user_id as string)));
  const userMap: Record<string, Record<string, unknown>> = {};
  if (memberUserIds.length > 0) {
    const { data: users } = await db.from('users').select('id, name, avatar_url, room_number, is_online, last_seen_at, is_deleted, is_active').in('id', memberUserIds);
    for (const u of (users || [])) {
      const rec = u as Record<string, unknown>;
      userMap[rec.id as string] = rec;
    }
  }

  const now = new Date();
  const creatorId = evt?.creator_user_id;

  const enriched = rawMembers.map((m: Record<string, unknown>) => {
    const u = userMap[m.user_id as string] || null;
    const lastSeen = u?.last_seen_at ? new Date(u.last_seen_at as string) : null;
    const isOnlineNow = u?.is_online && lastSeen && (now.getTime() - lastSeen.getTime()) < 2 * 60 * 1000;
    return {
      user_id: m.user_id,
      joined_at: m.created_at,
      name: u?.name || null,
      avatar_url: u?.avatar_url || null,
      room_number: u?.room_number || null,
      is_online: isOnlineNow ? 1 : 0,
      last_seen_at: u?.last_seen_at || null,
      is_creator: m.user_id === creatorId ? 1 : 0,
      is_deleted: u?.is_deleted || false,
      is_active: u?.is_active ?? true,
    };
  });

  // Sort: deleted/inactive last, creator first, then by join time
  enriched.sort((a, b) => {
    const aInactive = (a.is_deleted || !a.is_active) ? 1 : 0;
    const bInactive = (b.is_deleted || !b.is_active) ? 1 : 0;
    if (aInactive !== bInactive) return aInactive - bInactive;
    if (a.is_creator !== b.is_creator) return (b.is_creator as number) - (a.is_creator as number);
    return 0;
  });

  return json({ members: enriched });
}
