import { getServiceClient } from '@/src/lib/api-helpers';

type Db = ReturnType<typeof getServiceClient>;
export type TypingGroupType = 'main' | 'event' | 'listing';

// Clients poll every 5s and re-send while typing at most every 3s, so the
// window has to cover one full poll gap or the indicator flickers off.
const TYPING_WINDOW_MS = 8000;

/**
 * group_id stored for a chat. The main chat has no id; it is stored as 'main'
 * rather than NULL so the (user_id, group_type, group_id) unique index makes
 * the typing upsert update one row per user instead of adding a row per ping.
 */
export function typingGroupId(groupId: string | number | null | undefined): string {
  return groupId ? String(groupId) : 'main';
}

/** Users (other than the caller) who typed in this chat within the window. */
export async function getTypingUsers(db: Db, userId: string, groupType: string, groupId: string | null) {
  const cutoff = new Date(Date.now() - TYPING_WINDOW_MS).toISOString();

  // Two plain queries: the live DB has no FK for an embedded users join
  const { data: rows } = await db
    .from('typing_status')
    .select('user_id')
    .eq('group_type', groupType)
    .eq('group_id', typingGroupId(groupId))
    .neq('user_id', userId)
    .gt('last_typed_at', cutoff);
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
