import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';

async function requireAdmin(userId: string, db: ReturnType<typeof getServiceClient>) {
  const { data } = await db.from('users').select('is_admin').eq('id', userId).single();
  return data?.is_admin === 1 || data?.is_admin === true;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const db = getServiceClient();
  if (!await requireAdmin(userId, db)) return error('Only admins can pin messages', 403);
  const { id } = await params;
  await db.from('messages').update({ is_pinned: true, updated_at: new Date().toISOString() }).eq('id', parseInt(id));
  return json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const db = getServiceClient();
  if (!await requireAdmin(userId, db)) return error('Only admins can unpin messages', 403);
  const { id } = await params;
  await db.from('messages').update({ is_pinned: false, updated_at: new Date().toISOString() }).eq('id', parseInt(id));
  return json({ success: true });
}
