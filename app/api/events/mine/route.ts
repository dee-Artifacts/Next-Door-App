import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { dissolveCutoffIso } from '@/src/lib/events';

export async function GET() {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const db = getServiceClient();

  const { data: memberships } = await db.from('event_members').select('event_id').eq('user_id', userId);
  const eventIds = (memberships || []).map((m: { event_id: number }) => m.event_id);
  if (!eventIds.length) return json({ events: [] });

  // Fetch events without FK join (no REFERENCES constraint on events table)
  const { data: events } = await db.from('events')
    .select('*')
    .in('id', eventIds)
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
  const enriched = await Promise.all((events || []).map(async (evt: Record<string, unknown>) => {
    const { count } = await db.from('event_members').select('*', { count: 'exact', head: true }).eq('event_id', evt.id);
    const u = userMap[evt.creator_user_id as string] || null;
    const endTime = new Date(evt.end_datetime as string).getTime();
    return {
      ...evt,
      creator_name: u?.name || null,
      creator_is_deleted: u?.is_deleted ?? null,
      creator_is_active: u?.is_active ?? null,
      current_members: count || 0,
      is_joined: true,
      is_creator: evt.creator_user_id === userId,
      is_expired: now.getTime() > endTime,
    };
  }));

  return json({ events: enriched });
}
