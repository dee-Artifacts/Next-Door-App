import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error, sanitizeHtml } from '@/src/lib/api-helpers';
import { isEventDissolved } from '@/src/lib/events';
import { checkEventAccess, loadEventMessages, newChatCursor, readChatCursor } from '@/src/lib/chat-messages';
import { getTypingUsers } from '@/src/lib/typing';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const eventId = parseInt(id);

  const denied = await checkEventAccess(db, userId, eventId);
  if (denied) return error(denied.message, denied.status);

  // ?with_typing=1 (the chat view's poll) also returns who is typing, saving a separate request,
  // and a cursor; with ?after=<id>&since=<cursor> only what changed since the last fetch
  if (request.nextUrl.searchParams.get('with_typing') === '1') {
    const options = readChatCursor(request.nextUrl.searchParams);
    const cursor = newChatCursor();
    const [messages, typingUsers] = await Promise.all([
      loadEventMessages(db, eventId, options),
      getTypingUsers(db, userId, 'event', String(eventId)),
    ]);
    return json({ messages, typing_users: typingUsers, cursor });
  }
  return json(await loadEventMessages(db, eventId));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const eventId = parseInt(id);

  const { data: caller } = await db.from('users').select('is_active').eq('id', userId).single();
  if (!caller || caller.is_active === 0 || caller.is_active === false) return error('Your account has been deactivated', 403);

  const { data: membership } = await db.from('event_members').select('id').eq('event_id', eventId).eq('user_id', userId).maybeSingle();
  if (!membership) return error('Not a member of this event', 403);

  const { data: evt } = await db.from('events').select('id, end_datetime').eq('id', eventId).maybeSingle();
  if (!evt) return error('Event not found', 400);
  // Block only when event has been fully deleted (soft-delete uses year 2000)
  if ((evt as Record<string, unknown>).end_datetime && String((evt as Record<string, unknown>).end_datetime).startsWith('2000-')) return error('Event has been deleted', 400);
  if (isEventDissolved(evt.end_datetime)) return error('This event has ended', 400);

  const body = await request.json().catch(() => ({}));
  const { content, reply_to_message_id, attachments } = body;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if ((!content || !content.trim()) && !hasAttachments) return error('Content or attachment is required', 400);
  if (content && content.length > 5000) return error('Invalid content', 400);

  const { data: msg, error: insertErr } = await db.from('event_messages').insert({
    event_id: eventId, user_id: userId,
    content: content ? sanitizeHtml(content) : '',
    reply_to_message_id: reply_to_message_id || null,
  }).select().single();

  if (insertErr || !msg) return error('Failed to send message', 500);

  if (attachments?.length) {
    for (const att of attachments) {
      await db.from('event_message_attachments').insert({
        event_message_id: msg.id,
        filename: att.filename, file_key: att.file_key, file_size: att.file_size, content_type: att.content_type,
      });
    }
  }

  await db.from('typing_status').delete().eq('user_id', userId).eq('group_type', 'event').eq('group_id', String(eventId));

  const { data: u } = await db.from('users').select('name, avatar_url, room_number').eq('id', userId).single();
  const { data: msgAttachments } = await db.from('event_message_attachments').select('*').eq('event_message_id', msg.id);

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
