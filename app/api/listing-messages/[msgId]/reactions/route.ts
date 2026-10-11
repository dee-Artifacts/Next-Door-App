import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { touchMessage } from '@/src/lib/message-touch';

export async function POST(request: NextRequest, { params }: { params: Promise<{ msgId: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { msgId } = await params;
  const db = getServiceClient();
  const messageId = parseInt(msgId);

  const { data: caller } = await db.from('users').select('is_active').eq('id', userId).single();
  if (!caller || caller.is_active === 0 || caller.is_active === false) return error('Your account has been deactivated', 403);

  const { data: msg } = await db.from('listing_messages').select('listing_id').eq('id', messageId).maybeSingle();
  if (!msg) return error('Message not found', 404);

  const { data: listing } = await db.from('market_listings').select('creator_user_id').eq('id', msg.listing_id).maybeSingle();
  const isCreator = listing?.creator_user_id === userId;
  if (!isCreator) {
    const { data: isInterested } = await db.from('market_listing_interested').select('id').eq('listing_id', msg.listing_id).eq('user_id', userId).maybeSingle();
    if (!isInterested) return error('Not authorized to react to this message', 403);
  }

  const body = await request.json().catch(() => ({}));
  const { emoji } = body;
  if (!emoji) return error('emoji is required', 400);

  const { data: existing } = await db.from('listing_message_reactions')
    .select('id, emoji').eq('listing_message_id', messageId).eq('user_id', userId).maybeSingle();

  if (existing) {
    if (existing.emoji === emoji) {
      await db.from('listing_message_reactions').delete().eq('id', existing.id);
    } else {
      await db.from('listing_message_reactions').update({ emoji, updated_at: new Date().toISOString() }).eq('id', existing.id);
    }
  } else {
    await db.from('listing_message_reactions').insert({ listing_message_id: messageId, user_id: userId, emoji });
  }
  await touchMessage(db, 'listing_messages', messageId);

  return json({ success: true });
}
