import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { touchMessage } from '@/src/lib/message-touch';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const listingId = parseInt(id);

  const { data: mainImg } = await db.from('market_listing_images').select('image_url').eq('listing_id', listingId).order('display_order', { ascending: true }).limit(1).maybeSingle();
  const { data: listing } = await db.from('market_listings').select('*').eq('id', listingId).single();
  if (!listing) return error('Listing not found', 404);
  if (!listing.winner_user_id) return error('No winner selected for this listing', 400);

  const isCreator = listing.creator_user_id === userId;
  const isWinner = listing.winner_user_id === userId;

  if (listing.transaction_type === 'sale') {
    if (listing.type === 'offering' && !isWinner) return error('Only the winner can close this deal', 403);
    if (listing.type === 'requesting' && !isCreator) return error('Only the creator can close this deal', 403);
    if (listing.status !== 'confirmed') return error('Deal must be confirmed before closing', 400);
  } else if (listing.transaction_type === 'rent') {
    if (listing.status !== 'returned') return error('Product must be returned before closing rental deal', 400);
    if (listing.type === 'offering' && !isCreator) return error('Only the creator can close this rental deal', 403);
    if (listing.type === 'requesting' && !isWinner) return error('Only the winner can close this rental deal', 403);
  }

  const { data: creatorUser } = await db.from('users').select('id, name, room_number').eq('id', listing.creator_user_id).single();
  const { data: winnerUser } = await db.from('users').select('id, name, room_number').eq('id', listing.winner_user_id).single();

  // Create transaction record
  await db.from('market_transactions').insert({
    listing_title: listing.title, listing_type: listing.type, transaction_type: listing.transaction_type,
    is_free: listing.is_free, price: listing.price, image_url: mainImg?.image_url || null,
    creator_user_id: listing.creator_user_id, creator_name: creatorUser?.name || 'Unknown', creator_room: creatorUser?.room_number || null,
    winner_user_id: listing.winner_user_id, winner_name: winnerUser?.name || 'Unknown', winner_room: winnerUser?.room_number || null,
    rental_start_datetime: listing.rental_start_datetime, rental_end_datetime: listing.rental_end_datetime,
    closed_at: new Date().toISOString(),
  });

  // Notify all participants
  const { data: interested } = await db.from('market_listing_interested').select('user_id').eq('listing_id', listingId);
  const participantIds = [listing.creator_user_id, ...(interested || []).map((u: { user_id: string }) => u.user_id)];
  for (const pId of participantIds) {
    await db.from('notifications').insert({ user_id: pId, type: 'deal_closed', message_id: null });
  }

  // Clean up
  const { data: msgIds } = await db.from('listing_messages').select('id').eq('listing_id', listingId);
  const ids = (msgIds || []).map((m: { id: number }) => m.id);
  if (ids.length > 0) {
    // Delete attachment files from storage, then their rows
    const { data: msgAttachments } = await db.from('listing_message_attachments').select('file_key').in('listing_message_id', ids);
    const byBucket: Record<string, string[]> = {};
    for (const att of (msgAttachments || []) as Array<{ file_key: string | null }>) {
      if (!att.file_key) continue;
      const [bucket, ...rest] = att.file_key.split('/');
      (byBucket[bucket] ||= []).push(rest.join('/'));
    }
    for (const [bucket, paths] of Object.entries(byBucket)) {
      await db.storage.from(bucket).remove(paths);
    }

    await db.from('listing_message_attachments').delete().in('listing_message_id', ids);
    await db.from('listing_message_reactions').delete().in('listing_message_id', ids);
    await db.from('listing_message_reads').delete().in('listing_message_id', ids);
  }
  await db.from('listing_messages').delete().eq('listing_id', listingId);
  await db.from('typing_status').delete().eq('group_type', 'listing').eq('group_id', String(listingId));
  await db.from('market_listing_interested').delete().eq('listing_id', listingId);
  await db.from('market_listing_images').delete().eq('listing_id', listingId);
  await db.from('market_listings').delete().eq('id', listingId);
  await touchMessage(db, 'messages', listing.message_id);

  return json({ success: true });
}
