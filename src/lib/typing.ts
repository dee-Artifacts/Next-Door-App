import { getServiceClient } from '@/src/lib/api-helpers';

type Db = ReturnType<typeof getServiceClient>;
export type TypingGroupType = 'main' | 'event' | 'listing';

// Clients poll every 5s and re-send while typing at most every 3s, so the
// window has to cover one full poll gap or the indicator flickers off.
const TYPING_WINDOW_MS = 8000;

/** Users (other than the caller) who typed in this chat within the window. */
export async function getTypingUsers(db: Db, userId: string, groupType: string, groupId: string | null) {
  const cutoff = new Date(Date.now() - TYPING_WINDOW_MS).toISOString();

  // Two plain queries: the live DB has no FK for an embedded users join
  let query = db
    .from('typing_status')
    .select('user_id')
    .eq('group_type', groupType)
    .neq('user_id', userId)
    .gt('last_typed_at', cutoff);

  query = groupId ? query.eq('group_id', groupId) : query.is('group_id', null);

  const { data: rows } = await query;
  if (!rows?.length) return [];

  const userIds = Array.from(new Set(rows.map((row: { user_id: string }) => row.user_id)));
  const { data: users } = await db.from('users').select('id, name, avatar_url, room_number').in('id', userIds);
  const userMap: Record<string, Record<string, unknown>> = {};
  for (const u of (users || []) as Record<string, unknown>[]) userMap[u.id as string] = u;

  return userIds.map((id) => {
    const u = userMap[id];
    return { user_id: id, name: u?.name as string, avatar_url: (u?.avatar_url as string | null) ?? null, room_number: (u?.room_number as string | null) ?? null };
  });
}
