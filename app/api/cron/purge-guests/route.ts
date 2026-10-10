import { NextRequest } from 'next/server';
import { getServiceClient } from '@/src/lib/api-helpers';

/**
 * Purge expired guest (anonymous) accounts and the content they created.
 *
 * Guests are created by "Guest Access" (Supabase anonymous sign-in) and flagged
 * is_guest in the users table. This job removes guests older than GUEST_TTL_HOURS
 * (default 24h): their content rows, their users row, and the underlying
 * anonymous auth user (which frees Supabase MAU).
 *
 * Trigger it the same way as the other crons - POST with the x-webhook-secret
 * header - from your external scheduler (e.g. a daily/hourly hit).
 *
 * Note: user_id columns have no DB-level FK cascade, so references are cleared
 * explicitly below. Each delete is best-effort: a missing table/column is logged
 * and skipped rather than aborting the whole purge.
 *
 * Runs monthly, so it works in batches with a time budget and is safe to re-run:
 * a guest's users row is deleted last, so a guest interrupted halfway is simply
 * picked up again next time. The response says `done: false` when work is left.
 */

export const maxDuration = 60;

const TTL_HOURS = Number(process.env.GUEST_TTL_HOURS || '24');
const GUEST_BATCH = 50;
const AUTH_DELETE_CONCURRENCY = 5;
// cron-job.org gives up after 30s; stop starting new work well before that
const TIME_BUDGET_MS = 20_000;

// [table, column] rows keyed to a user that should be removed with the guest.
const USER_REFERENCES: Array<[string, string]> = [
  ['reactions', 'user_id'],
  ['message_reads', 'user_id'],
  ['messages', 'user_id'],
  ['notifications', 'user_id'],
  ['notifications', 'mentioned_by_user_id'],
  ['email_notification_users', 'user_id'],
  ['event_message_reactions', 'user_id'],
  ['event_message_reads', 'user_id'],
  ['event_messages', 'user_id'],
  ['event_members', 'user_id'],
  ['events', 'creator_user_id'],
  ['typing_status', 'user_id'],
  ['listing_message_reactions', 'user_id'],
  ['listing_message_reads', 'user_id'],
  ['listing_messages', 'user_id'],
  ['market_listing_interested', 'user_id'],
  ['market_listings', 'creator_user_id'],
  ['hashtags', 'created_by'],
];

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.CRON_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;

  try {
    const db = getServiceClient();
    const threshold = new Date(Date.now() - TTL_HOURS * 60 * 60 * 1000).toISOString();

    let purged = 0;
    let done = false;
    const failedIds: string[] = [];

    while (!outOfTime()) {
      let query = db
        .from('users')
        .select('id')
        .eq('is_guest', true)
        .lt('created_at', threshold)
        .order('created_at', { ascending: true })
        .limit(GUEST_BATCH);
      if (failedIds.length) query = query.not('id', 'in', `(${failedIds.join(',')})`);
      const { data: batch, error: selectErr } = await query;
      if (selectErr) throw selectErr;
      if (!batch?.length) {
        done = true;
        break;
      }
      const guestIds = batch.map((g: { id: string }) => g.id);

      // Content first: one delete per table for the whole batch
      for (const [table, column] of USER_REFERENCES) {
        const { error } = await db.from(table).delete().in(column, guestIds);
        if (error) console.warn(`[purge-guests] ${table}.${column}:`, error.message);
      }

      // Then the anonymous auth users (frees Supabase MAU and revokes their sessions).
      // "Not found" means an earlier run already removed it.
      const authFailed = new Set<string>();
      for (let i = 0; i < guestIds.length; i += AUTH_DELETE_CONCURRENCY) {
        await Promise.all(guestIds.slice(i, i + AUTH_DELETE_CONCURRENCY).map(async (guestId) => {
          const { error: authErr } = await db.auth.admin.deleteUser(guestId);
          if (authErr && authErr.status !== 404) {
            console.warn(`[purge-guests] auth delete ${guestId}:`, authErr.message);
            authFailed.add(guestId);
          }
        }));
      }

      // The users row goes last, so an interrupted guest is found again next run
      const doneIds = guestIds.filter((id) => !authFailed.has(id));
      if (doneIds.length) {
        const { error: delErr } = await db.from('users').delete().in('id', doneIds);
        if (delErr) {
          console.error('[purge-guests] users delete failed:', delErr.message);
          failedIds.push(...doneIds);
        } else {
          purged += doneIds.length;
        }
      }
      failedIds.push(...Array.from(authFailed));
    }

    return Response.json({
      success: true,
      done: done && failedIds.length === 0,
      purged,
      failed: failedIds.length,
      ttl_hours: TTL_HOURS,
      ms: Date.now() - started,
    });
  } catch (error) {
    console.error('[cron/purge-guests] error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
