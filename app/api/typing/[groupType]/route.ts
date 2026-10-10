import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { getTypingUsers } from '@/src/lib/typing';

export async function GET(request: NextRequest, { params }: { params: Promise<{ groupType: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { groupType } = await params;
  const db = getServiceClient();

  const groupId = request.nextUrl.searchParams.get('group_id') || null;
  return json({ typing_users: await getTypingUsers(db, userId, groupType, groupId) });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ groupType: string }> }) {
  // cleanup endpoint - /api/typing/cleanup
  const { groupType } = await params;
  if (groupType !== 'cleanup') return error('Not found', 404);

  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const db = getServiceClient();

  const cutoff = new Date(Date.now() - 30000).toISOString();
  await db.from('typing_status').delete().lt('last_typed_at', cutoff);

  return json({ success: true });
}
