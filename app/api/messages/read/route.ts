import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';

export async function POST(request: NextRequest) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);

  const body = await request.json().catch(() => ({}));
  const messageIds: number[] = (Array.isArray(body.message_ids) ? body.message_ids : [])
    .map(Number)
    .filter((id: number) => Number.isInteger(id) && id > 0);
  if (!messageIds.length) return json({ success: true });

  const db = getServiceClient();
  const now = new Date().toISOString();
  const inserts = messageIds.map(id => ({ message_id: id, user_id: userId, read_at: now }));
  // Keep the original read_at for messages that were already read
  await db.from('message_reads').upsert(inserts, { onConflict: 'message_id,user_id', ignoreDuplicates: true });

  // Move last_read_message_id forward only; batches can arrive out of order
  const maxId = Math.max(...messageIds);
  await db.from('users').update({ last_read_message_id: maxId })
    .eq('id', userId)
    .or(`last_read_message_id.is.null,last_read_message_id.lt.${maxId}`);
  return json({ success: true });
}
