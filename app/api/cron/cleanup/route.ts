import { NextRequest } from 'next/server';
import { getServiceClient } from '@/src/lib/api-helpers';
import { dissolveCutoffIso, EVENT_GRACE_MS } from '@/src/lib/events';

/**
 * Monthly cleanup (cron-job.org, POST with x-webhook-secret):
 *   1. delete events that dissolved (ended 24h+ ago), archiving them to event_history
 *   2. expire stale announcements
 *
 * The app already hides dissolved events itself (src/lib/events.ts), so this only
 * reclaims space. It works in batches with a time budget, and every step can be
 * repeated safely: if a run stops partway (timeout, error) the next run carries on.
 * The response says `done: false` when work is left over.
 */

export const maxDuration = 60;

const EVENT_BATCH = 25;
const MESSAGE_BATCH = 500;
// cron-job.org gives up after 30s; stop starting new work well before that
const TIME_BUDGET_MS = 20_000;

type Db = ReturnType<typeof getServiceClient>;
type Row = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.CRON_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;

  try {
    const db = getServiceClient();
    const nowIso = new Date().toISOString();

    // ── 1. Delete dissolved events, a batch at a time ─────────────────────────
    let deletedEvents = 0;
    let done = false;
    const failedIds: number[] = [];

    while (!outOfTime()) {
      let query = db.from('events')
        .select('id, name, description, start_datetime, end_datetime, location, max_members, image_url, creator_user_id, message_id')
        .lt('end_datetime', dissolveCutoffIso())
        .order('id', { ascending: true })
        .limit(EVENT_BATCH);
      if (failedIds.length) query = query.not('id', 'in', `(${failedIds.join(',')})`);
      const { data: batch, error: selectErr } = await query;
      if (selectErr) throw selectErr;
      if (!batch?.length) {
        done = true;
        break;
      }

      try {
        const finished = await dissolveEvents(db, batch as Row[], nowIso, outOfTime);
        if (!finished) break; // out of time mid-batch; the next run picks it up
        deletedEvents += batch.length;
      } catch (err) {
        console.error('[cron/cleanup] batch failed, skipping these events this run:', err);
        failedIds.push(...batch.map((e: Row) => e.id as number));
      }
    }

    // ── 2. Expire stale announcements ─────────────────────────────────────────
    const { count: expiredAnnouncements } = await db
      .from('messages')
      .update({ is_active_announcement: false }, { count: 'exact' })
      .eq('is_active_announcement', true)
      .lt('announcement_expires_at', nowIso);

    return Response.json({
      success: true,
      done: done && failedIds.length === 0,
      dissolved_events: deletedEvents,
      failed_events: failedIds,
      expired_announcements: expiredAnnouncements ?? 0,
      ms: Date.now() - started,
    });
  } catch (error) {
    console.error('[cron/cleanup] error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Archive and delete one batch of dissolved events. Each step is safe to repeat.
 * Returns false if it ran out of time before finishing (nothing is lost).
 */
async function dissolveEvents(db: Db, events: Row[], nowIso: string, outOfTime: () => boolean) {
  const eventIds = events.map((e) => e.id as number);

  // Archive first, while members still exist (attendee list and count)
  const { data: archived } = await db.from('event_history').select('event_id').in('event_id', eventIds);
  const archivedIds = new Set((archived || []).map((h: Row) => h.event_id as number));
  const toArchive = events.filter((e) => !archivedIds.has(e.id as number));

  if (toArchive.length > 0) {
    const archiveIds = toArchive.map((e) => e.id as number);
    const creatorIds = Array.from(new Set(toArchive.map((e) => e.creator_user_id as string)));
    const [{ data: members }, { data: creators }] = await Promise.all([
      db.from('event_members').select('event_id, user_id').in('event_id', archiveIds),
      db.from('users').select('id, name, room_number').in('id', creatorIds),
    ]);
    const membersByEvent: Record<number, string[]> = {};
    for (const m of (members || []) as Array<{ event_id: number; user_id: string }>) {
      (membersByEvent[m.event_id] ||= []).push(m.user_id);
    }
    const creatorMap: Record<string, Row> = {};
    for (const u of (creators || []) as Row[]) creatorMap[u.id as string] = u;

    const { data: histRows, error: histErr } = await db.from('event_history').insert(
      toArchive.map((e) => ({
        event_id: e.id,
        name: e.name, description: e.description, location: e.location,
        start_datetime: e.start_datetime, end_datetime: e.end_datetime,
        max_members: e.max_members, image_url: e.image_url,
        creator_user_id: e.creator_user_id,
        creator_name: creatorMap[e.creator_user_id as string]?.name ?? null,
        creator_room: creatorMap[e.creator_user_id as string]?.room_number ?? null,
        total_attendees: membersByEvent[e.id as number]?.length || 0,
        is_deleted: false,
        // Same date the app showed before archiving (see loadUnarchivedEventHistory)
        ended_at: new Date(new Date(e.end_datetime as string).getTime() + EVENT_GRACE_MS).toISOString(),
      }))
    ).select('id, event_id');
    if (histErr) throw histErr;

    const attendees = (histRows || []).flatMap((h: Row) =>
      (membersByEvent[h.event_id as number] || []).map((userId) => ({ event_history_id: h.id, user_id: userId }))
    );
    if (attendees.length > 0) {
      const { error: attErr } = await db.from('event_history_attendees').insert(attendees);
      if (attErr) console.warn('[cron/cleanup] attendees not archived:', attErr.message);
    }
  }

  // Event chat messages, their reads/reactions/attachments and stored files
  for (;;) {
    if (outOfTime()) return false;
    // Two plain queries: the live DB has no FK for an embedded attachments join
    const { data: msgs, error: msgErr } = await db.from('event_messages')
      .select('id')
      .in('event_id', eventIds)
      .limit(MESSAGE_BATCH);
    if (msgErr) throw msgErr;
    if (!msgs?.length) break;

    const msgIds = msgs.map((m: Row) => m.id as number);
    const { data: atts, error: attErr } = await db.from('event_message_attachments')
      .select('file_key')
      .in('event_message_id', msgIds);
    if (attErr) throw attErr;
    const byBucket: Record<string, string[]> = {};
    for (const att of (atts || []) as Array<{ file_key: string | null }>) {
      if (!att.file_key) continue;
      const [bucket, ...rest] = att.file_key.split('/');
      (byBucket[bucket] ||= []).push(rest.join('/'));
    }
    for (const [bucket, paths] of Object.entries(byBucket)) {
      await db.storage.from(bucket).remove(paths);
    }

    await Promise.all([
      db.from('event_message_reads').delete().in('event_message_id', msgIds),
      db.from('event_message_reactions').delete().in('event_message_id', msgIds),
      db.from('event_message_attachments').delete().in('event_message_id', msgIds),
    ]);
    await db.from('event_messages').delete().in('id', msgIds);
  }

  await Promise.all([
    db.from('event_members').delete().in('event_id', eventIds),
    db.from('typing_status').delete().eq('group_type', 'event').in('group_id', eventIds.map(String)),
  ]);

  // Main-chat event cards: soft-delete, keeping the name for display
  const cards = events.filter((e) => e.message_id);
  if (cards.length > 0) {
    await db.from('notifications').delete().in('message_id', cards.map((e) => e.message_id as number));
    await Promise.all(cards.map((e) =>
      db.from('messages').update({
        is_deleted: true,
        content: `"${e.name}" event has been deleted`,
        updated_at: nowIso,
      }).eq('id', e.message_id as number)
    ));
  }

  const { error: delErr } = await db.from('events').delete().in('id', eventIds);
  if (delErr) throw delErr;
  return true;
}
