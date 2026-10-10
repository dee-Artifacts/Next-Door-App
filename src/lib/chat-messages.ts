/**
 * Chat history loaders shared by the message routes and /api/sync.
 * Pass `afterId` to get only messages newer than that id.
 */

import { getServiceClient } from '@/src/lib/api-helpers';

type Db = ReturnType<typeof getServiceClient>;
interface LoadOptions { afterId?: number }
type AccessDenied = { status: number; message: string } | null;

/** Main (group) chat: messages plus the caller's last_read_message_id. */
export async function loadMainMessages(db: Db, userId: string, groupId: string, { afterId }: LoadOptions = {}) {
  // Select messages without FK join - the messages table has no REFERENCES constraint
  // so Supabase cannot resolve !messages_user_id_fkey and returns an error silently.
  // We join user data manually below.
  let query = db.from('messages').select(
    'id, user_id, content, created_at, updated_at, is_edited, reply_to_message_id, is_pinned, event_id, listing_id, is_deleted, group_id, is_active_announcement, announcement_expires_at'
  ).order('created_at', { ascending: true });

  if (groupId === 'main') {
    query = query.or('group_id.eq.main,group_id.is.null');
  } else {
    query = query.eq('group_id', groupId);
  }
  if (afterId) query = query.gt('id', afterId);

  const { data: rawMessages, error: msgErr } = await query;

  if (msgErr) throw new Error(`Failed to load messages: ${msgErr.message}`);

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
  if (eventMsgIds.length > 0) {
    const { data: evts } = await db.from('events').select('*').in('id', eventMsgIds);
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

  // Fetch system messages (app-wide, no group filter) and merge
  // Incremental fetches (afterId) skip them; the next full load picks them up.
  const { data: systemMsgs } = afterId
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
  return null;
}

export async function loadEventMessages(db: Db, eventId: number, { afterId }: LoadOptions = {}) {
  // Fetch messages without FK joins
  let query = db.from('event_messages').select('*').eq('event_id', eventId);
  if (afterId) query = query.gt('id', afterId);
  const { data: messages } = await query.order('created_at', { ascending: true });

  if (!messages?.length) return [];

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

export async function loadListingMessages(db: Db, listingId: number, { afterId }: LoadOptions = {}) {
  // Fetch messages without FK joins (no REFERENCES constraints on listing_messages)
  let query = db.from('listing_messages').select('*').eq('listing_id', listingId);
  if (afterId) query = query.gt('id', afterId);
  const { data: messages } = await query.order('created_at', { ascending: true });

  if (!messages?.length) return [];

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
