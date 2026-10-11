import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { touchMessage, touchListingCard } from '@/src/lib/message-touch';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const listingId = parseInt(id);

  const body = await request.json().catch(() => ({}));
  const { winner_user_id: winnerId } = body;
  if (!winnerId) return error('Winner user ID is required', 400);

  const { data: listing } = await db.from('market_listings').select('*').eq('id', listingId).single();
  if (!listing) return error('Listing not found', 404);
  if (listing.creator_user_id !== userId) return error('Only the creator can select a winner', 403);

  const { data: isInterested } = await db.from('market_listing_interested').select('id').eq('listing_id', listingId).eq('user_id', winnerId).maybeSingle();
  if (!isInterested) return error('Selected user must be interested in the listing', 400);

  const { data: winnerUser } = await db.from('users').select('id, name').eq('id', winnerId).single();
  if (!winnerUser) return error('Winner user not found', 404);

  await db.from('market_listings').update({ winner_user_id: winnerId, status: 'confirmed' }).eq('id', listingId);
  await touchMessage(db, 'messages', listing.message_id);

  await db.from('listing_messages').insert({
    listing_id: listingId, user_id: userId,
    content: `🎉 ${winnerUser.name} has won the deal!`,
  });

  return json({ success: true, winner_name: winnerUser.name });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const listingId = parseInt(id);

  const { data: listing } = await db.from('market_listings').select('creator_user_id').eq('id', listingId).single();
  if (!listing) return error('Listing not found', 404);
  if (listing.creator_user_id !== userId) return error('Only the creator can clear the winner', 403);

  await db.from('market_listings').update({ winner_user_id: null, status: 'discussion' }).eq('id', listingId);
  await touchListingCard(db, listingId);
  await db.from('listing_messages').insert({
    listing_id: listingId, user_id: userId,
    content: 'Winner selection has been cleared.',
  });

  return json({ success: true });
}
