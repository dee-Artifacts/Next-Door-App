import { getServiceClient } from '@/src/lib/api-helpers';

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
