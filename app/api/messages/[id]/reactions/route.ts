import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { touchMessage } from '@/src/lib/message-touch';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);

  const { id } = await params;
  const msgId = parseInt(id);
  const body = await request.json().catch(() => ({}));
  const { emoji } = body;
  if (!emoji) return error('Emoji is required', 400);

  const db = getServiceClient();
  const { data: existing } = await db.from('reactions')
    .select('id').eq('message_id', msgId).eq('user_id', userId).eq('emoji', emoji).maybeSingle();

  if (existing) {
    await db.from('reactions').delete().eq('id', existing.id);
  } else {
    await db.from('reactions').insert({ message_id: msgId, user_id: userId, emoji });
  }
  await touchMessage(db, 'messages', msgId);
  return json({ success: true });
}
