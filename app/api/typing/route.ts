import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { typingGroupId } from '@/src/lib/typing';

export async function POST(request: NextRequest) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const db = getServiceClient();

  const { data: caller } = await db.from('users').select('is_active').eq('id', userId).single();
  if (!caller || caller.is_active === 0 || caller.is_active === false) return error('Your account has been deactivated', 403);

  const body = await request.json().catch(() => ({}));
  const { group_type, group_id } = body;
  if (!group_type) return error('group_type is required', 400);

  await db.from('typing_status').upsert({
    user_id: userId,
    group_type,
    group_id: typingGroupId(group_id),
    last_typed_at: new Date().toISOString(),
  }, { onConflict: 'user_id,group_type,group_id' });

  return json({ success: true });
}
