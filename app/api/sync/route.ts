import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { getMainUnreadCount } from '@/src/lib/unread';
import {
  loadMainMessages, loadEventMessages, loadListingMessages, checkEventAccess, checkListingAccess,
  newChatCursor, readChatCursor,
} from '@/src/lib/chat-messages';

/**
 * One request for everything a chat screen needs to stay current, so the
 * client never fans out into several polls:
 *   - header counts: main-chat unread, unread mentions/replies, live admin reminders
 *   - with ?chat=main|event:<id>|listing:<id>&after=<last message id>&since=<cursor>:
 *     what changed in that chat since the last fetch, plus a new cursor
 *     (used by the 5-minute idle check; see chat-messages)
 *
 * A blocked account gets 403 so the client can sign it out.
 */
export async function GET(request: NextRequest) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const db = getServiceClient();

  const { data: me } = await db.from('users').select('is_active, is_deleted').eq('id', userId).single();
  if (me && (me.is_active === 0 || me.is_active === false) && !me.is_deleted) {
    return error('Your account has been blocked', 403);
  }

  const chat = request.nextUrl.searchParams.get('chat');
  const options = readChatCursor(request.nextUrl.searchParams);
  const cursor = newChatCursor();

  const [unreadCount, { count: mentionCount }, { count: reminderCount }, messages] = await Promise.all([
    getMainUnreadCount(db, userId),
    db.from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false),
    db.from('reminders')
      .select('*', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString()),
    chat && (options.afterId || options.since) ? loadNewMessages(db, userId, chat, options) : Promise.resolve(undefined),
  ]);

  return json({
    unread_count: unreadCount,
    mention_count: mentionCount || 0,
    reminder_count: reminderCount || 0,
    ...(messages !== undefined && { messages, cursor }),
  });
}

/** New and changed messages in one chat, or [] if the caller can no longer see it. */
async function loadNewMessages(
  db: ReturnType<typeof getServiceClient>, userId: string, chat: string, options: ReturnType<typeof readChatCursor>
): Promise<unknown[]> {
  if (chat === 'main') {
    const { messages } = await loadMainMessages(db, userId, 'main', options);
    return messages;
  }

  const [kind, rawId] = chat.split(':');
  const id = parseInt(rawId);
  if (!id) return [];

  if (kind === 'event') {
    if (await checkEventAccess(db, userId, id)) return [];
    return loadEventMessages(db, id, options);
  }
  if (kind === 'listing') {
    if (await checkListingAccess(db, userId, id)) return [];
    return loadListingMessages(db, id, options);
  }
  return [];
}
