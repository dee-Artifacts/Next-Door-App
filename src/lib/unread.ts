import { getServiceClient } from '@/src/lib/api-helpers';
import { isEventDissolved } from '@/src/lib/events';

type Db = ReturnType<typeof getServiceClient>;

/** Unread messages from others in the main chat since the caller's last_read_message_id. */
export async function getMainUnreadCount(db: Db, userId: string): Promise<number> {
  const { data: user } = await db.from('users').select('last_read_message_id').eq('id', userId).single();

  // If this user has never read any messages (first login), set their baseline to
  // the current latest message so they don't see ALL history as unread.
  if (user && (user.last_read_message_id === null || user.last_read_message_id === undefined)) {
    const { data: latest } = await db.from('messages')
      .select('id')
      .or('group_id.eq.main,group_id.is.null')
      .order('id', { ascending: false })
      .limit(1)
      .single();
    if (latest) {
      await db.from('users').update({ last_read_message_id: latest.id }).eq('id', userId);
    }
    return 0;
  }

  const lastReadId = user?.last_read_message_id || 0;

  const { count } = await db.from('messages')
    .select('*', { count: 'exact', head: true })
    .gt('id', lastReadId)
    .neq('user_id', userId)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .or('group_id.eq.main,group_id.is.null');

  return count || 0;
}

/**
 * Unread counts (messages from others with no read receipt by the caller) for
 * several event or listing chats in one go, keyed by chat id. Chats the caller
 * can't see, and ended events, count 0.
 */
async function countUnread(
  db: Db,
  userId: string,
  chatIds: number[],
  chat: { table: 'event_messages' | 'listing_messages'; column: string; readsTable: string; readsKey: string }
): Promise<Record<number, number>> {
  const counts: Record<number, number> = {};
  if (chatIds.length === 0) return counts;

  const [{ data: reads }, perChat] = await Promise.all([
    db.from(chat.readsTable).select(chat.readsKey).eq('user_id', userId),
    Promise.all(chatIds.map((id) =>
      db.from(chat.table).select('id').eq(chat.column, id).neq('user_id', userId)
    )),
  ]);

  const readSet = new Set(((reads || []) as unknown as Record<string, number>[]).map((r) => r[chat.readsKey]));
  chatIds.forEach((id, i) => {
    counts[id] = ((perChat[i].data || []) as { id: number }[]).filter((m) => !readSet.has(m.id)).length;
  });
  return counts;
}

export async function getEventUnreadCounts(db: Db, userId: string, eventIds: number[]) {
  const [{ data: memberships }, { data: events }] = await Promise.all([
    db.from('event_members').select('event_id').eq('user_id', userId).in('event_id', eventIds),
    db.from('events').select('id, end_datetime').in('id', eventIds),
  ]);
  const joined = new Set((memberships || []).map((m: { event_id: number }) => m.event_id));
  const visible = (events || [])
    .filter((e: { id: number; end_datetime: string }) => joined.has(e.id) && !isEventDissolved(e.end_datetime))
    .map((e: { id: number }) => e.id);

  const counts = await countUnread(db, userId, visible, {
    table: 'event_messages', column: 'event_id', readsTable: 'event_message_reads', readsKey: 'event_message_id',
  });
  return Object.fromEntries(eventIds.map((id) => [id, counts[id] ?? 0])) as Record<number, number>;
}

export async function getListingUnreadCounts(db: Db, userId: string, listingIds: number[]) {
  const [{ data: listings }, { data: interested }] = await Promise.all([
    db.from('market_listings').select('id, creator_user_id').in('id', listingIds),
    db.from('market_listing_interested').select('listing_id').eq('user_id', userId).in('listing_id', listingIds),
  ]);
  const interestedIn = new Set((interested || []).map((r: { listing_id: number }) => r.listing_id));
  const createdBy = new Set(
    (listings || []).filter((l: { creator_user_id: string }) => l.creator_user_id === userId).map((l: { id: number }) => l.id)
  );
  // Same rule as the single-listing count: creator or interested
  const visible = listingIds.filter((id) => createdBy.has(id) || interestedIn.has(id));

  const counts = await countUnread(db, userId, visible, {
    table: 'listing_messages', column: 'listing_id', readsTable: 'listing_message_reads', readsKey: 'listing_message_id',
  });
  return Object.fromEntries(listingIds.map((id) => [id, counts[id] ?? 0])) as Record<number, number>;
}

/** Parse ?ids=1,2,3 (at most 100 positive integers). */
export function parseIdList(raw: string | null): number[] {
  const ids = (raw || '').split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n > 0);
  return Array.from(new Set(ids)).slice(0, 100);
}
