import { getServiceClient } from '@/src/lib/api-helpers';

type Db = ReturnType<typeof getServiceClient>;
export type TypingGroupType = 'main' | 'event' | 'listing';

// Clients poll every 5s and re-send while typing at most every 3s, so the
// window has to cover one full poll gap or the indicator flickers off.
const TYPING_WINDOW_MS = 8000;

/** Users (other than the caller) who typed in this chat within the window. */
export async function getTypingUsers(db: Db, userId: string, groupType: string, groupId: string | null) {
  const cutoff = new Date(Date.now() - TYPING_WINDOW_MS).toISOString();

  let query = db
    .from('typing_status')
    .select('user_id, users!typing_status_user_id_fkey(name, avatar_url, room_number)')
    .eq('group_type', groupType)
    .neq('user_id', userId)
    .gt('last_typed_at', cutoff);

  query = groupId ? query.eq('group_id', groupId) : query.is('group_id', null);

  const { data } = await query;

  return (data || []).map((row: Record<string, unknown>) => {
    const u = row.users as Record<string, unknown> | null;
    return { user_id: row.user_id as string, name: u?.name as string, avatar_url: (u?.avatar_url as string | null) ?? null, room_number: (u?.room_number as string | null) ?? null };
  });
}
