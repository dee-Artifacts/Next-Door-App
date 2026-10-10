/**
 * Event lifecycle rules shared by the API.
 *
 * An event stays visible (and its chat usable) for 24h after it ends. After
 * that it is "dissolved": the app hides it everywhere, even though the monthly
 * cleanup job (/api/cron/cleanup) may not have deleted and archived it yet.
 */

import { getServiceClient } from '@/src/lib/api-helpers';

type Db = ReturnType<typeof getServiceClient>;

export const EVENT_GRACE_MS = 24 * 60 * 60 * 1000;

/** ISO time before which an event's end_datetime means it has dissolved. */
export function dissolveCutoffIso(now = Date.now()) {
  return new Date(now - EVENT_GRACE_MS).toISOString();
}

export function isEventDissolved(endDatetime: string | null | undefined, now = Date.now()) {
  if (!endDatetime) return false;
  return new Date(endDatetime).getTime() + EVENT_GRACE_MS <= now;
}

/**
 * Dissolved events that cleanup hasn't archived yet, shaped like event_history
 * rows so the history panel shows them straight away. Ids are negative so they
 * can't collide with real event_history ids. With `userId`, only events that
 * user created or was a member of.
 */
export async function loadUnarchivedEventHistory(db: Db, { userId }: { userId?: string } = {}) {
  const { data: events } = await db.from('events')
    .select('id, name, description, location, start_datetime, end_datetime, max_members, image_url, creator_user_id')
    .lt('end_datetime', dissolveCutoffIso());
  if (!events?.length) return [];

  const eventIds = events.map((e: Record<string, unknown>) => e.id as number);
  const creatorIds = Array.from(new Set(events.map((e: Record<string, unknown>) => e.creator_user_id as string)));
  const [{ data: members }, { data: creators }] = await Promise.all([
    db.from('event_members').select('event_id, user_id').in('event_id', eventIds),
    db.from('users').select('id, name, room_number').in('id', creatorIds),
  ]);

  const memberCount: Record<number, number> = {};
  const memberOf = new Set<number>();
  for (const m of (members || []) as Array<{ event_id: number; user_id: string }>) {
    memberCount[m.event_id] = (memberCount[m.event_id] || 0) + 1;
    if (m.user_id === userId) memberOf.add(m.event_id);
  }
  const creatorMap: Record<string, Record<string, unknown>> = {};
  for (const u of (creators || []) as Record<string, unknown>[]) creatorMap[u.id as string] = u;

  return events
    .filter((e: Record<string, unknown>) => !userId || e.creator_user_id === userId || memberOf.has(e.id as number))
    .map((e: Record<string, unknown>) => {
      const end = e.end_datetime as string;
      return {
        id: -(e.id as number),
        event_id: e.id,
        name: e.name,
        description: e.description,
        location: e.location,
        start_datetime: e.start_datetime,
        end_datetime: end,
        max_members: e.max_members,
        image_url: e.image_url,
        creator_user_id: e.creator_user_id,
        creator_name: creatorMap[e.creator_user_id as string]?.name ?? null,
        creator_room: creatorMap[e.creator_user_id as string]?.room_number ?? null,
        total_attendees: memberCount[e.id as number] || 0,
        is_deleted: end.startsWith('2000-01-01'),
        ended_at: new Date(new Date(end).getTime() + EVENT_GRACE_MS).toISOString(),
      };
    });
}
