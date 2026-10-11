import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { touchMessage, touchListingCard } from '@/src/lib/message-touch';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const listingId = parseInt(id);

  const { data: caller } = await db.from('users').select('is_active, name, room_number').eq('id', userId).single();
  if (!caller || caller.is_active === 0 || caller.is_active === false) return error('Your account has been deactivated', 403);

  const { data: listing } = await db.from('market_listings').select('*').eq('id', listingId).single();
  if (!listing) return error('Listing not found', 404);
  if (listing.creator_user_id === userId) return error('You cannot express interest in your own listing', 400);
  if (listing.status === 'closed') return error('This listing is closed', 400);

  const { data: existing } = await db.from('market_listing_interested').select('id').eq('listing_id', listingId).eq('user_id', userId).maybeSingle();
  if (existing) return error('You have already expressed interest', 400);

  await db.from('market_listing_interested').insert({ listing_id: listingId, user_id: userId });

  // Join message in listing chat
  await db.from('listing_messages').insert({
    listing_id: listingId, user_id: userId,
    content: `joined_listing:${caller.name}:${caller.room_number || ''}`,
  });

  // Update to discussion if first interest
  if (listing.status === 'open') {
    await db.from('market_listings').update({ status: 'discussion' }).eq('id', listingId);
  }
  await touchMessage(db, 'messages', listing.message_id);

  return json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const listingId = parseInt(id);

  const { data: u } = await db.from('users').select('name, room_number').eq('id', userId).single();

  await db.from('market_listing_interested').delete().eq('listing_id', listingId).eq('user_id', userId);
  await touchListingCard(db, listingId);

  if (u) {
    await db.from('listing_messages').insert({
      listing_id: listingId, user_id: userId,
      content: `left_listing:${u.name}:${u.room_number || ''}`,
    });
  }

  return json({ success: true });
}
