import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { getMainUnreadCount } from '@/src/lib/unread';

/**
 * One request for everything the chat header needs, so the badge counts are
 * polled once instead of through three separate routes.
 *
 * Returns the main-chat unread count, unread mentions/replies and live admin
 * reminders. A blocked account gets 403 so the client can sign it out.
 */
export async function GET() {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const db = getServiceClient();

  const { data: me } = await db.from('users').select('is_active, is_deleted').eq('id', userId).single();
  if (me && (me.is_active === 0 || me.is_active === false) && !me.is_deleted) {
    return error('Your account has been blocked', 403);
  }

  const [unreadCount, { count: mentionCount }, { count: reminderCount }] = await Promise.all([
    getMainUnreadCount(db, userId),
    db.from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false),
    db.from('reminders')
      .select('*', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString()),
  ]);

  return json({
    unread_count: unreadCount,
    mention_count: mentionCount || 0,
    reminder_count: reminderCount || 0,
  });
}
