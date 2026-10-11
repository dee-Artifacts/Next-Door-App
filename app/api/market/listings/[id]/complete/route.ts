import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const listingId = parseInt(id);

  const body = await request.json().catch(() => ({}));
  const helperUserIds: string[] = body.helper_user_ids || [];
  let helperNames: string[] = [];

  if (helperUserIds.length > 0) {
    const { data: helpers } = await db.from('users').select('id, name').in('id', helperUserIds);
    helperNames = helperUserIds.map(hId => {
      const found = (helpers || []).find((h: { id: string; name: string }) => h.id === hId);
      return found?.name || 'Unknown';
    });
  }

  const { data: listing } = await db.from('market_listings').select('*').eq('id', listingId).single();
  if (!listing) return error('Listing not found', 404);
  if (listing.creator_user_id !== userId) return error('Only the creator can complete this request', 403);

  const { data: msgIds } = await db.from('listing_messages').select('id').eq('listing_id', listingId);
  const ids = (msgIds || []).map((m: { id: number }) => m.id);
  if (ids.length > 0) {
    // Delete listing message attachments from storage
    // (separate query: the live DB has no FK for an embedded join)
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

    // Delete message-related data
    await db.from('listing_message_attachments').delete().in('listing_message_id', ids);
    await db.from('listing_message_reactions').delete().in('listing_message_id', ids);
    await db.from('listing_message_reads').delete().in('listing_message_id', ids);
  }
  await db.from('listing_messages').delete().eq('listing_id', listingId);
  await db.from('typing_status').delete().eq('group_type', 'listing').eq('group_id', String(listingId));
  await db.from('market_listing_interested').delete().eq('listing_id', listingId);
  await db.from('market_listing_images').delete().eq('listing_id', listingId);

  // Archive to history
  await archiveToHistory(db, listingId, false, helperUserIds, helperNames);

  await db.from('market_listings').update({ is_deleted: true, is_completed: true }).eq('id', listingId);

  return json({ success: true });
}

async function archiveToHistory(db: ReturnType<typeof getServiceClient>, listingId: number, isDeleted: boolean, helperUserIds?: string[], helperNames?: string[]) {
  const { data: listing } = await db.from('market_listings').select('*').eq('id', listingId).single();
  if (!listing) return;

  const { data: creatorUser } = await db.from('users').select('name, room_number').eq('id', listing.creator_user_id).maybeSingle();
  const winnerUser = listing.winner_user_id
    ? (await db.from('users').select('name, room_number').eq('id', listing.winner_user_id).maybeSingle()).data
    : null;

  const { count: interestCount } = await db.from('market_listing_interested').select('*', { count: 'exact', head: true }).eq('listing_id', listingId);
  const { data: mainImage } = await db.from('market_listing_images').select('image_url').eq('listing_id', listingId).order('display_order', { ascending: true }).limit(1).maybeSingle();

  const { data: existing } = await db.from('market_listing_history').select('id').eq('listing_id', listingId).maybeSingle();
  const historyData = {
    is_deleted: isDeleted,
    total_interested: interestCount || 0,
    winner_user_id: listing.winner_user_id || null,
    winner_name: winnerUser?.name || null,
    winner_room: winnerUser?.room_number || null,
    helper_user_ids: helperUserIds ? JSON.stringify(helperUserIds) : null,
    helper_names: helperNames ? JSON.stringify(helperNames) : null,
    ended_at: new Date().toISOString(),
  };

  if (existing) {
    await db.from('market_listing_history').update(historyData).eq('listing_id', listingId);
  } else {
    await db.from('market_listing_history').insert({
      listing_id: listingId, title: listing.title, description: listing.description,
      type: listing.type, transaction_type: listing.transaction_type, is_free: listing.is_free, price: listing.price,
      image_url: mainImage?.image_url || null,
      creator_user_id: listing.creator_user_id, creator_name: creatorUser?.name || 'Unknown', creator_room: creatorUser?.room_number || null,
      ...historyData,
    });
  }
}
