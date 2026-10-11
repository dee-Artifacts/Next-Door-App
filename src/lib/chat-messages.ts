/**
 * Chat history loaders shared by the message routes and /api/sync.
 *
 * With no options they load the whole chat (a chat's first load). After that
 * the client sends `after` (the newest message id it holds) and `since` (the
 * `cursor` from its previous response) and gets back only messages newer than
 * `after` plus older ones that changed since `since`: edits, deletes,
 * reactions, pins, reads, and card changes (see message-touch). `afterId`
 * alone (older clients' idle check) returns new messages only.
 */

import { getServiceClient } from '@/src/lib/api-helpers';
import { EVENT_GRACE_MS, isEventDissolved } from '@/src/lib/events';

type Db = ReturnType<typeof getServiceClient>;
type Row = Record<string, unknown>;
interface LoadOptions { afterId?: number; since?: string }
type AccessDenied = { status: number; message: string } | null;

// Look this much further back than the client's cursor, to cover clock
// differences between servers and writes still in flight during the last
// fetch. Recent changes may therefore arrive twice; clients merge by id.
const CHANGE_OVERLAP_MS = 10_000;

/** Read `after` and `since` from a chat fetch's query string. */
export function readChatCursor(params: URLSearchParams): LoadOptions {
  const afterId = Number(params.get('after')) || 0;
  const sinceMs = Date.parse(params.get('since') || '');
  if (Number.isNaN(sinceMs)) return { afterId };
  return { afterId, since: new Date(sinceMs - CHANGE_OVERLAP_MS).toISOString() };
}

/** The `cursor` for the client's next fetch. Take it before loading anything. */
export function newChatCursor() {
  return new Date().toISOString();
}

function byCreatedAt(a: Row, b: Row) {
  return new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime();
}

function uniqueIds(rows: Row[] | null, column: string, exclude: Set<number>) {
  return Array.from(new Set((rows || []).map((r) => r[column] as number).filter((id) => id && !exclude.has(id))));
}

const MAIN_COLUMNS =
  'id, user_id, content, created_at, updated_at, is_edited, reply_to_message_id, is_pinned, event_id, listing_id, is_deleted, group_id, is_active_announcement, announcement_expires_at';

/**
 * Main chat rows that are new or changed since `since`. Besides updated_at
 * this catches changes nobody writes: new reads, announcements expiring, and
 * event cards turning "ended" at the end time and "deleted" 24h later.
 */
async function loadChangedMainRows(db: Db, groupId: string, afterId: number, since: string): Promise<Row[]> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const graceSince = new Date(Date.parse(since) - EVENT_GRACE_MS).toISOString();
  const graceNow = new Date(now - EVENT_GRACE_MS).toISOString();

  const [{ data: rows, error: rowsErr }, { data: reads }, { data: endedEvents }] = await Promise.all([
    db.from('messages').select(MAIN_COLUMNS).or(
      `id.gt.${afterId},updated_at.gt."${since}",and(announcement_expires_at.gt."${since}",announcement_expires_at.lte."${nowIso}")`
    ),
    db.from('message_reads').select('message_id').gt('read_at', since),
    db.from('events').select('message_id').not('message_id', 'is', null).or(
      `and(end_datetime.gt."${since}",end_datetime.lte."${nowIso}"),and(end_datetime.gt."${graceSince}",end_datetime.lte."${graceNow}")`
    ),
  ]);
  if (rowsErr) throw new Error(`Failed to load messages: ${rowsErr.message}`);

  const found = (rows || []) as Row[];
  const have = new Set(found.map((m) => m.id as number));
  const extraIds = uniqueIds([...(reads || []), ...(endedEvents || [])] as Row[], 'message_id', have);
  if (extraIds.length > 0) {
    const { data: extra, error: extraErr } = await db.from('messages').select(MAIN_COLUMNS).in('id', extraIds);
    if (extraErr) throw new Error(`Failed to load messages: ${extraErr.message}`);
    found.push(...((extra || []) as Row[]));
  }

  // Filtered here rather than in the queries: the main chat's group test is
  // itself an OR, and PostgREST takes one top-level OR per query.
  return found
    .filter((m) => groupId === 'main' ? (m.group_id === 'main' || m.group_id == null) : m.group_id === groupId)
    .sort(byCreatedAt);
}

/** Main (group) chat: messages plus the caller's last_read_message_id. */
export async function loadMainMessages(db: Db, userId: string, groupId: string, { afterId, since }: LoadOptions = {}) {
  // Select messages without FK join - the messages table has no REFERENCES constraint
  // so Supabase cannot resolve !messages_user_id_fkey and returns an error silently.
  // We join user data manually below.
  let rawMessages: Row[];
  if (since) {
    rawMessages = await loadChangedMainRows(db, groupId, afterId ?? 0, since);
  } else {
    let query = db.from('messages').select(MAIN_COLUMNS).order('created_at', { ascending: true });

    if (groupId === 'main') {
      query = query.or('group_id.eq.main,group_id.is.null');
    } else {
      query = query.eq('group_id', groupId);
    }
    if (afterId) query = query.gt('id', afterId);

    const { data, error: msgErr } = await query;
    if (msgErr) throw new Error(`Failed to load messages: ${msgErr.message}`);
    rawMessages = (data || []) as Row[];
  }

  // Collect unique user IDs and fetch their profiles in one query
  const allUserIds = (rawMessages || []).map((m: Record<string, unknown>) => m.user_id as string);
  const userIds = allUserIds.filter((id, idx) => allUserIds.indexOf(id) === idx);
  const userMap: Record<string, Record<string, unknown>> = {};
  if (userIds.length > 0) {
    const { data: users } = await db.from('users')
      .select('id, name, avatar_url, room_number, is_deleted, is_active')
      .in('id', userIds);
    for (const u of (users || [])) {
      const rec = u as Record<string, unknown>;
      userMap[rec.id as string] = rec;
    }
  }

  // Batch-fetch reply_to messages for preview
  const replyIds = Array.from(new Set(
    (rawMessages || [])
      .map((m: Record<string, unknown>) => m.reply_to_message_id as number)
      .filter(Boolean)
  ));
  const replyMap: Record<number, { content: string; user_id: string }> = {};
  if (replyIds.length > 0) {
    const { data: replyMsgs } = await db.from('messages')
      .select('id, content, user_id')
      .in('id', replyIds);
    for (const r of (replyMsgs || [])) {
      const rec = r as Record<string, unknown>;
      replyMap[rec.id as number] = { content: rec.content as string, user_id: rec.user_id as string };
    }
  }

  type MsgRow = Record<string, unknown> & { id: number; user_id: string };
  const messages: MsgRow[] = (rawMessages || []).map((m: Record<string, unknown>) => {
    const u = userMap[m.user_id as string] || null;
    const replyId = m.reply_to_message_id as number | null;
    const reply = replyId ? replyMap[replyId] : null;
    const replyUser = reply ? (userMap[reply.user_id] || null) : null;
    return {
      ...m,
      id: m.id as number,
      user_id: m.user_id as string,
      type: 'message',          // MessageList filters regularMessages by type === 'message'
      user_name: u?.name || null,
      user_avatar_url: u?.avatar_url || null,
      user_room_number: u?.room_number || null,
      user_is_deleted: u?.is_deleted || null,
      user_is_active: u?.is_active || null,
      reply_to_content: reply?.content || null,
      reply_to_user_name: replyUser?.name || null,
      reactions: [] as unknown[],
      attachments: [] as unknown[],
      reads: [] as unknown[],
    };
  });

  // Fetch reactions, attachments, reads for all messages
  const messageIds = messages.map((m) => m.id);
  if (messageIds.length > 0) {
    const [{ data: reactions }, { data: attachments }, { data: reads }] = await Promise.all([
      db.from('reactions').select('id, message_id, user_id, emoji, created_at').in('message_id', messageIds),
      db.from('attachments').select('*').in('message_id', messageIds),
      db.from('message_reads').select('id, message_id, user_id, read_at').in('message_id', messageIds),
    ]);

    const reactMap: Record<number, unknown[]> = {};
    const attMap: Record<number, unknown[]> = {};
    const readMap: Record<number, unknown[]> = {};

    for (const r of (reactions || [])) {
      const rec = r as Record<string, unknown>;
      const mid = rec.message_id as number;
      if (!reactMap[mid]) reactMap[mid] = [];
      // Attach user name from our userMap
      const uname = userMap[rec.user_id as string]?.name || null;
      reactMap[mid].push({ ...rec, user_name: uname });
    }
    for (const a of (attachments || [])) {
      const rec = a as Record<string, unknown>;
      const mid = rec.message_id as number;
      if (!attMap[mid]) attMap[mid] = [];
      attMap[mid].push(rec);
    }
    for (const r of (reads || [])) {
      const rec = r as Record<string, unknown>;
      const mid = rec.message_id as number;
      if (!readMap[mid]) readMap[mid] = [];
      const u = userMap[rec.user_id as string] || null;
      readMap[mid].push({ ...rec, user_name: u?.name || null, user_avatar_url: u?.avatar_url || null });
    }

    for (const m of messages) {
      m.reactions = reactMap[m.id as number] || [];
      m.attachments = attMap[m.id as number] || [];
      m.reads = readMap[m.id as number] || [];
    }
  }

  // Batch-fetch events for messages with event_id
  const eventMsgIds = Array.from(new Set(messages.map(m => m.event_id as number).filter(Boolean)));
  const eventObjMap: Record<number, Record<string, unknown>> = {};
  // Events dissolved (ended 24h+ ago) but not yet removed by the monthly cleanup:
  // show their card the way cleanup leaves it, as a deleted message.
  const dissolvedEventNames: Record<number, string> = {};
  if (eventMsgIds.length > 0) {
    const { data: allEvts } = await db.from('events').select('*').in('id', eventMsgIds);
    const evts = (allEvts || []).filter((e: Record<string, unknown>) => {
      if (!isEventDissolved(e.end_datetime as string)) return true;
      dissolvedEventNames[e.id as number] = e.name as string;
      return false;
    });
    const evtCreatorIds = Array.from(new Set((evts || []).map((e: Record<string, unknown>) => e.creator_user_id as string)));
    const evtUserMap: Record<string, Record<string, unknown>> = {};
    if (evtCreatorIds.length > 0) {
      const { data: evtUsers } = await db.from('users').select('id, name, is_deleted, is_active').in('id', evtCreatorIds);
      for (const u of (evtUsers || [])) {
        const rec = u as Record<string, unknown>;
        evtUserMap[rec.id as string] = rec;
      }
    }
    for (const e of (evts || [])) {
      const rec = e as Record<string, unknown>;
      const u = evtUserMap[rec.creator_user_id as string] || null;
      const { count: memberCount } = await db.from('event_members').select('*', { count: 'exact', head: true }).eq('event_id', rec.id);
      const { data: memberRow } = await db.from('event_members').select('id').eq('event_id', rec.id as number).eq('user_id', userId).maybeSingle();
      eventObjMap[rec.id as number] = {
        ...rec,
        creator_name: u?.name || null,
        creator_is_deleted: u?.is_deleted ?? null,
        creator_is_active: u?.is_active ?? null,
        current_members: memberCount || 0,
        is_joined: !!memberRow,
        is_creator: rec.creator_user_id === userId,
        is_expired: new Date(rec.end_datetime as string) <= new Date(),
      };
    }
    for (const m of messages) {
      const eid = m.event_id as number | null;
      if (eid && eventObjMap[eid]) {
        (m as Record<string, unknown>).event = eventObjMap[eid];
      } else if (eid && dissolvedEventNames[eid] !== undefined) {
        m.is_deleted = true;
        m.content = `"${dissolvedEventNames[eid]}" event has been deleted`;
      }
    }
  }

  // Batch-fetch listings for messages with listing_id
  const listingMsgIds = Array.from(new Set(messages.map(m => m.listing_id as number).filter(Boolean)));
  const listingObjMap: Record<number, Record<string, unknown>> = {};
  if (listingMsgIds.length > 0) {
    const { data: listings } = await db.from('market_listings').select('*').in('id', listingMsgIds);
    const listingCreatorIds = Array.from(new Set((listings || []).map((l: Record<string, unknown>) => l.creator_user_id as string)));
    const listUserMap: Record<string, Record<string, unknown>> = {};
    if (listingCreatorIds.length > 0) {
      const { data: listUsers } = await db.from('users').select('id, name, avatar_url, room_number, is_deleted, is_active').in('id', listingCreatorIds);
      for (const u of (listUsers || [])) {
        const rec = u as Record<string, unknown>;
        listUserMap[rec.id as string] = rec;
      }
    }
    // Batch-fetch interested status for current user across all listings
    const interestedSet = new Set<number>();
    if (listingMsgIds.length > 0) {
      const { data: interestRows } = await db.from('market_listing_interested').select('listing_id').eq('user_id', userId).in('listing_id', listingMsgIds);
      for (const r of (interestRows || [])) {
        interestedSet.add((r as Record<string, unknown>).listing_id as number);
      }
    }

    // Batch-fetch interested counts per listing
    const interestedCountMap: Record<number, number> = {};
    if (listingMsgIds.length > 0) {
      const { data: allInterestRows } = await db.from('market_listing_interested').select('listing_id').in('listing_id', listingMsgIds);
      for (const r of (allInterestRows || [])) {
        const lid = (r as Record<string, unknown>).listing_id as number;
        interestedCountMap[lid] = (interestedCountMap[lid] || 0) + 1;
      }
    }

    for (const l of (listings || [])) {
      const rec = l as Record<string, unknown>;
      const u = listUserMap[rec.creator_user_id as string] || null;
      const { data: images } = await db.from('market_listing_images').select('image_url, display_order').eq('listing_id', rec.id).order('display_order', { ascending: true });
      listingObjMap[rec.id as number] = {
        ...rec,
        creator_name: u?.name || null,
        creator_avatar: u?.avatar_url || null,
        creator_room: u?.room_number || null,
        creator_is_deleted: u?.is_deleted ?? null,
        creator_is_active: u?.is_active ?? null,
        images: (images || []).map((img: Record<string, unknown>) => img.image_url),
        is_creator: rec.creator_user_id === userId ? 1 : 0,
        is_interested: interestedSet.has(rec.id as number) ? 1 : 0,
        interested_count: interestedCountMap[rec.id as number] || 0,
      };
    }
    for (const m of messages) {
      const lid = m.listing_id as number | null;
      if (lid && listingObjMap[lid]) {
        (m as Record<string, unknown>).listing = listingObjMap[lid];
      }
    }
  }

  // Override is_active_announcement=false for any expired announcements (cron handles DB update)
  const nowTs = Date.now();
  for (const m of messages) {
    const expiresAt = m.announcement_expires_at as string | null;
    if ((m.is_active_announcement === true || m.is_active_announcement === 1) && expiresAt && new Date(expiresAt).getTime() < nowTs) {
      m.is_active_announcement = false;
    }
  }

  // Fetch system messages (app-wide, no group filter) and merge.
  // Incremental fetches get the ones added or changed since `since`; the
  // older new-only check (afterId alone) skips them.
  const { data: systemMsgs } = since
    ? await db.from('system_messages').select('*').gt('updated_at', since)
    : afterId
      ? { data: [] as Record<string, unknown>[] }
      : await db.from('system_messages').select('*').order('created_at', { ascending: true });

  const combined = [
    ...messages,
    ...(systemMsgs || []).map((s: Record<string, unknown>) => ({ ...s, type: 'system' })),
  ].sort((a, b) =>
    new Date((a as Record<string, unknown>).created_at as string).getTime() -
    new Date((b as Record<string, unknown>).created_at as string).getTime()
  );

  // Fetch the current user's last_read_message_id so the client can compute unread position
  const { data: userRow } = await db.from('users').select('last_read_message_id').eq('id', userId).single();


  return { messages: combined, last_read_message_id: (userRow?.last_read_message_id as number | null) || null };
}

/** The caller must be active and a member of the event. */
export async function checkEventAccess(db: Db, userId: string, eventId: number): Promise<AccessDenied> {
  const { data: caller } = await db.from('users').select('is_active').eq('id', userId).single();
  if (!caller || caller.is_active === 0 || caller.is_active === false) return { status: 403, message: 'Your account has been deactivated' };

  const { data: membership } = await db.from('event_members').select('id').eq('event_id', eventId).eq('user_id', userId).maybeSingle();
  if (!membership) return { status: 403, message: 'Not a member of this event' };

  const { data: evt } = await db.from('events').select('end_datetime').eq('id', eventId).maybeSingle();
  if (!evt || isEventDissolved(evt.end_datetime)) return { status: 404, message: 'This event has ended' };
  return null;
}

/**
 * Event or listing chat rows: all of them, or (with `since`) the new and
 * changed ones, including messages read by someone since `since`.
 */
async function loadChatRows(
  db: Db,
  chat: { table: 'event_messages' | 'listing_messages'; readsTable: string; readsKey: string; column: string; id: number },
  { afterId, since }: LoadOptions
): Promise<Row[]> {
  let query = db.from(chat.table).select('*').eq(chat.column, chat.id);
  if (since) query = query.or(`id.gt.${afterId ?? 0},updated_at.gt."${since}"`);
  else if (afterId) query = query.gt('id', afterId);

  const [{ data }, { data: reads }] = await Promise.all([
    query.order('created_at', { ascending: true }),
    since ? db.from(chat.readsTable).select(chat.readsKey).gt('read_at', since) : Promise.resolve({ data: null }),
  ]);
  const rows = (data || []) as Row[];
  if (!since) return rows;

  const readIds = uniqueIds(reads as Row[] | null, chat.readsKey, new Set(rows.map((m) => m.id as number)));
  if (readIds.length === 0) return rows;
  const { data: extra } = await db.from(chat.table).select('*').eq(chat.column, chat.id).in('id', readIds);
  return [...rows, ...((extra || []) as Row[])].sort(byCreatedAt);
}

export async function loadEventMessages(db: Db, eventId: number, options: LoadOptions = {}) {
  // Fetch messages without FK joins
  const messages = await loadChatRows(db, {
    table: 'event_messages', readsTable: 'event_message_reads', readsKey: 'event_message_id', column: 'event_id', id: eventId,
  }, options);

  if (!messages.length) return [];

  // Batch-fetch user data
  const userIds = Array.from(new Set(messages.map((m: Record<string, unknown>) => m.user_id as string).filter(Boolean)));
  const userMap: Record<string, Record<string, unknown>> = {};
  if (userIds.length > 0) {
    const { data: users } = await db.from('users').select('id, name, avatar_url, room_number').in('id', userIds);
    for (const u of (users || [])) {
      const rec = u as Record<string, unknown>;
      userMap[rec.id as string] = rec;
    }
  }

  // Batch-fetch reply messages
  const replyIds = Array.from(new Set(messages.map((m: Record<string, unknown>) => m.reply_to_message_id as number).filter(Boolean)));
  const replyMap: Record<number, { content: string; user_id: string }> = {};
  if (replyIds.length > 0) {
    const { data: replyMsgs } = await db.from('event_messages').select('id, content, user_id').in('id', replyIds);
    for (const r of (replyMsgs || [])) {
      const rec = r as Record<string, unknown>;
      replyMap[rec.id as number] = { content: rec.content as string, user_id: rec.user_id as string };
    }
  }

  // Batch-fetch attachments, reactions, reads
  const msgIds = messages.map((m: Record<string, unknown>) => m.id as number);
  const [{ data: allAtts }, { data: allReacts }, { data: allReads }] = await Promise.all([
    db.from('event_message_attachments').select('*').in('event_message_id', msgIds),
    db.from('event_message_reactions').select('id, event_message_id, user_id, emoji, created_at').in('event_message_id', msgIds),
    db.from('event_message_reads').select('id, event_message_id, user_id, read_at').in('event_message_id', msgIds),
  ]);

  const attMap: Record<number, unknown[]> = {};
  const reactMap: Record<number, unknown[]> = {};
  const readMap: Record<number, unknown[]> = {};
  for (const a of (allAtts || [])) {
    const rec = a as Record<string, unknown>;
    const mid = rec.event_message_id as number;
    if (!attMap[mid]) attMap[mid] = [];
    attMap[mid].push(rec);
  }
  for (const r of (allReacts || [])) {
    const rec = r as Record<string, unknown>;
    const mid = rec.event_message_id as number;
    if (!reactMap[mid]) reactMap[mid] = [];
    reactMap[mid].push({ ...rec, user_name: userMap[rec.user_id as string]?.name || null });
  }
  for (const r of (allReads || [])) {
    const rec = r as Record<string, unknown>;
    const mid = rec.event_message_id as number;
    if (!readMap[mid]) readMap[mid] = [];
    const u = userMap[rec.user_id as string] || null;
    readMap[mid].push({ ...rec, user_name: u?.name || null, user_avatar_url: u?.avatar_url || null });
  }

  const enriched = messages.map((msg: Record<string, unknown>) => {
    const u = userMap[msg.user_id as string] || null;
    const replyId = msg.reply_to_message_id as number | null;
    const reply = replyId ? replyMap[replyId] : null;
    const replyUser = reply ? (userMap[reply.user_id] || null) : null;
    const content = msg.content as string | null;
    const mid = msg.id as number;
    return {
      ...msg,
      user_name: u?.name || null,
      avatar_url: u?.avatar_url || null,
      room_number: u?.room_number || null,
      reply_to_content: reply?.content || null,
      reply_to_user_id: reply?.user_id || null,
      reply_to_user_name: replyUser?.name || null,
      is_join_message: content?.startsWith('joined_event:') || content?.startsWith('created_event:') || undefined,
      is_creator_join: content?.startsWith('created_event:') || undefined,
      is_leave_message: content?.startsWith('left_event:') || undefined,
      is_event_details: content?.startsWith('event_details:') || undefined,
      event_details: content?.startsWith('event_details:') ? (() => { try { return JSON.parse(content.substring('event_details:'.length)); } catch { return null; } })() : undefined,
      attachments: attMap[mid] || [],
      reactions: reactMap[mid] || [],
      reads: readMap[mid] || [],
    };
  });

  return enriched;
}

/** The caller must be active and either the listing's creator or marked interested. */
export async function checkListingAccess(db: Db, userId: string, listingId: number): Promise<AccessDenied> {
  const { data: caller } = await db.from('users').select('is_active').eq('id', userId).single();
  if (!caller || caller.is_active === 0 || caller.is_active === false) return { status: 403, message: 'Your account has been deactivated' };

  const { data: listing } = await db.from('market_listings').select('creator_user_id').eq('id', listingId).maybeSingle();
  if (!listing) return { status: 404, message: 'Listing not found' };

  const isCreator = listing.creator_user_id === userId;
  if (!isCreator) {
    const { data: isInterested } = await db.from('market_listing_interested').select('id').eq('listing_id', listingId).eq('user_id', userId).maybeSingle();
    if (!isInterested) return { status: 403, message: 'Not authorized to view this listing\'s messages' };
  }
  return null;
}

export async function loadListingMessages(db: Db, listingId: number, options: LoadOptions = {}) {
  // Fetch messages without FK joins (no REFERENCES constraints on listing_messages)
  const messages = await loadChatRows(db, {
    table: 'listing_messages', readsTable: 'listing_message_reads', readsKey: 'listing_message_id', column: 'listing_id', id: listingId,
  }, options);

  if (!messages.length) return [];

  // Batch-fetch user data
  const userIds = Array.from(new Set(messages.map((m: Record<string, unknown>) => m.user_id as string).filter(Boolean)));
  const userMap: Record<string, Record<string, unknown>> = {};
  if (userIds.length > 0) {
    const { data: users } = await db.from('users').select('id, name, avatar_url, room_number').in('id', userIds);
    for (const u of (users || [])) {
      const rec = u as Record<string, unknown>;
      userMap[rec.id as string] = rec;
    }
  }

  // Batch-fetch reply messages for preview
  const replyIds = Array.from(new Set(messages.map((m: Record<string, unknown>) => m.reply_to_message_id as number).filter(Boolean)));
  const replyMap: Record<number, { content: string; user_id: string }> = {};
  if (replyIds.length > 0) {
    const { data: replyMsgs } = await db.from('listing_messages').select('id, content, user_id').in('id', replyIds);
    for (const r of (replyMsgs || [])) {
      const rec = r as Record<string, unknown>;
      replyMap[rec.id as number] = { content: rec.content as string, user_id: rec.user_id as string };
    }
  }

  // Batch-fetch attachments, reactions, reads
  const msgIds = messages.map((m: Record<string, unknown>) => m.id as number);
  const [{ data: allAttachments }, { data: allReactions }, { data: allReads }] = await Promise.all([
    db.from('listing_message_attachments').select('*').in('listing_message_id', msgIds),
    db.from('listing_message_reactions').select('id, listing_message_id, user_id, emoji, created_at').in('listing_message_id', msgIds),
    db.from('listing_message_reads').select('id, listing_message_id, user_id, read_at').in('listing_message_id', msgIds),
  ]);

  const attMap: Record<number, unknown[]> = {};
  const reactMap: Record<number, unknown[]> = {};
  const readMap: Record<number, unknown[]> = {};
  for (const a of (allAttachments || [])) {
    const rec = a as Record<string, unknown>;
    const mid = rec.listing_message_id as number;
    if (!attMap[mid]) attMap[mid] = [];
    attMap[mid].push(rec);
  }
  for (const r of (allReactions || [])) {
    const rec = r as Record<string, unknown>;
    const mid = rec.listing_message_id as number;
    if (!reactMap[mid]) reactMap[mid] = [];
    reactMap[mid].push({ ...rec, user_name: userMap[rec.user_id as string]?.name || null });
  }
  for (const r of (allReads || [])) {
    const rec = r as Record<string, unknown>;
    const mid = rec.listing_message_id as number;
    if (!readMap[mid]) readMap[mid] = [];
    const u = userMap[rec.user_id as string] || null;
    readMap[mid].push({ ...rec, user_name: u?.name || null, user_avatar_url: u?.avatar_url || null });
  }

  const enriched = messages.map((msg: Record<string, unknown>) => {
    const u = userMap[msg.user_id as string] || null;
    const replyId = msg.reply_to_message_id as number | null;
    const reply = replyId ? replyMap[replyId] : null;
    const replyUser = reply ? (userMap[reply.user_id] || null) : null;
    const content = msg.content as string | null;
    const mid = msg.id as number;
    return {
      ...msg,
      user_name: u?.name || null,
      avatar_url: u?.avatar_url || null,
      room_number: u?.room_number || null,
      reply_to_content: reply?.content || null,
      reply_to_user_id: reply?.user_id || null,
      reply_to_user_name: replyUser?.name || null,
      is_join_message: content?.startsWith('joined_listing:') || content?.startsWith('created_listing:') || undefined,
      is_creator_join: content?.startsWith('created_listing:') || undefined,
      is_leave_message: content?.startsWith('left_listing:') || undefined,
      is_listing_details: content?.startsWith('listing_details:') || undefined,
      listing_details: content?.startsWith('listing_details:') ? (() => { try { return JSON.parse(content.substring('listing_details:'.length)); } catch { return null; } })() : undefined,
      attachments: attMap[mid] || [],
      reactions: reactMap[mid] || [],
      reads: readMap[mid] || [],
    };
  });

  return enriched;
}
