import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';

export async function POST() {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);

  const db = getServiceClient();
  const { data } = await db.from('users')
    .update({ is_online: true, last_seen_at: new Date().toISOString() })
    .eq('id', userId)
    .select('is_active, is_deleted')
    .single();

  // The client signs out when this says the account was blocked (replaces a separate /api/profile poll)
  return json({ success: true, is_active: data?.is_active ?? null, is_deleted: data?.is_deleted ?? null });
}
