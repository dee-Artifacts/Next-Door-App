import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { touchMessage } from '@/src/lib/message-touch';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const listingId = parseInt(id);

  const { data: listing } = await db.from('market_listings').select('*').eq('id', listingId).single();
  if (!listing) return error('Listing not found', 404);
  if (listing.transaction_type !== 'rent') return error('Only rental listings can be marked as returned', 400);
  if (listing.status !== 'confirmed') return error('Listing must be in confirmed status', 400);

  const isCreator = listing.creator_user_id === userId;
  const isWinner = listing.winner_user_id === userId;

  if (listing.type === 'offering' && !isWinner) return error('Only the winner can mark this rental as returned', 403);
  if (listing.type === 'requesting' && !isCreator) return error('Only the creator can mark this rental as returned', 403);

  await db.from('market_listings').update({ status: 'returned' }).eq('id', listingId);
  await touchMessage(db, 'messages', listing.message_id);

  const { data: u } = await db.from('users').select('name').eq('id', userId).single();
  await db.from('listing_messages').insert({
    listing_id: listingId, user_id: userId,
    content: `📦 ${u?.name || 'User'} has confirmed the product has been returned.`,
  });

  return json({ success: true });
}
