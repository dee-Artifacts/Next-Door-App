import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error, sanitizeHtml } from '@/src/lib/api-helpers';
import { checkListingAccess, loadListingMessages, newChatCursor, readChatCursor } from '@/src/lib/chat-messages';
import { getTypingUsers } from '@/src/lib/typing';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const listingId = parseInt(id);

  const denied = await checkListingAccess(db, userId, listingId);
  if (denied) return error(denied.message, denied.status);

  // ?with_typing=1 (the chat view's poll) also returns who is typing, saving a separate request,
  // and a cursor; with ?after=<id>&since=<cursor> only what changed since the last fetch
  if (request.nextUrl.searchParams.get('with_typing') === '1') {
    const options = readChatCursor(request.nextUrl.searchParams);
    const cursor = newChatCursor();
    const [messages, typingUsers] = await Promise.all([
      loadListingMessages(db, listingId, options),
      getTypingUsers(db, userId, 'listing', String(listingId)),
    ]);
    return json({ messages, typing_users: typingUsers, cursor });
  }
  return json(await loadListingMessages(db, listingId));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const listingId = parseInt(id);

  const { data: caller } = await db.from('users').select('is_active').eq('id', userId).single();
  if (!caller || caller.is_active === 0 || caller.is_active === false) return error('Your account has been deactivated', 403);

  const { data: listing } = await db.from('market_listings').select('creator_user_id').eq('id', listingId).maybeSingle();
  if (!listing) return error('Listing not found', 404);

  const isCreator = listing.creator_user_id === userId;
  if (!isCreator) {
    const { data: isInterested } = await db.from('market_listing_interested').select('id').eq('listing_id', listingId).eq('user_id', userId).maybeSingle();
    if (!isInterested) return error('Not a member of this listing chat', 403);
  }

  const body = await request.json().catch(() => ({}));
  const { content, reply_to_message_id, attachments } = body;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if ((!content || !content.trim()) && !hasAttachments) return error('Content or attachment is required', 400);
  if (content && content.length > 5000) return error('Invalid content', 400);

  const { data: msg, error: insertErr } = await db.from('listing_messages').insert({
    listing_id: listingId, user_id: userId,
    content: content ? sanitizeHtml(content) : '',
    reply_to_message_id: reply_to_message_id || null,
  }).select().single();

  if (insertErr || !msg) return error('Failed to send message', 500);

  if (attachments?.length) {
    for (const att of attachments) {
      await db.from('listing_message_attachments').insert({
        listing_message_id: msg.id,
        filename: att.filename, file_key: att.file_key, file_size: att.file_size, content_type: att.content_type,
      });
    }
  }

  await db.from('typing_status').delete().eq('user_id', userId).eq('group_type', 'listing').eq('group_id', String(listingId));

  const { data: u } = await db.from('users').select('name, avatar_url, room_number').eq('id', userId).single();
  const { data: msgAttachments } = await db.from('listing_message_attachments').select('*').eq('listing_message_id', msg.id);

  return json({
    ...msg,
    user_name: u?.name || null,
    avatar_url: u?.avatar_url || null,
    room_number: u?.room_number || null,
    attachments: msgAttachments || [],
    reactions: [],
    reads: [],
  }, 201);
}
