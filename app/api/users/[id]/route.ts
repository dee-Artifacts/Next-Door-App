import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { buildAccountDeletedEmail } from '@/src/lib/email-templates';
import { sendEmail } from '@/src/lib/send-email';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);

  const { id } = await params;
  const db = getServiceClient();
  const { data: user } = await db
    .from('users')
    .select('id, name, room_number, avatar_url, is_admin, is_active, is_deleted, created_at')
    .eq('id', id)
    .single();

  if (!user) return error('User not found', 404);
  return json(user);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);

  const db = getServiceClient();
  const { data: caller } = await db.from('users').select('is_admin').eq('id', userId).single();
  if (!caller || !(caller.is_admin === 1 || caller.is_admin === true)) return error('Only admins can delete users', 403);

  const { id: targetId } = await params;
  if (targetId === userId) return error('You cannot delete your own account', 400);

  // Fetch name/email/room BEFORE anonymizing - needed for notifications and emails
  const { data: targetUser } = await db.from('users').select('name, email, room_number').eq('id', targetId).single();
  const userName = (targetUser as Record<string, unknown> | null)?.name as string | null ?? 'User';
  const userEmail = (targetUser as Record<string, unknown> | null)?.email as string | null;

  // ─── STEP 1: CASCADE REMOVE FROM EVENTS & LISTINGS ───────────────────────

  // 1B. Delete events where user is the CREATOR
  const { data: userEvents } = await db
    .from('events')
    .select('id, name, message_id, description, location, start_datetime, end_datetime, max_members, image_url, creator_user_id')
    .eq('creator_user_id', targetId);

  // 1A. Remove user as a PARTICIPANT from events they did not create
  //     (events they created are fully cascade-deleted in 1B below)
  const ownedEventIds = (userEvents || []).map((e: Record<string, unknown>) => e.id as number);
  if (ownedEventIds.length > 0) {
    await db.from('event_members').delete().eq('user_id', targetId).not('event_id', 'in', `(${ownedEventIds.join(',')})`);
  } else {
    await db.from('event_members').delete().eq('user_id', targetId);
  }

  for (const evt of (userEvents || [])) {
    const evtRec = evt as Record<string, unknown>;
    const eventId = evtRec.id as number;

    // Fetch all event messages, then their attachment file_keys for storage cleanup
    // (separate query: the live DB has no FK for an embedded attachments join)
    const { data: eventMsgs } = await db.from('event_messages').select('id').eq('event_id', eventId);
    const msgIds = (eventMsgs || []).map((m: Record<string, unknown>) => m.id as number);

    // Fetch members before deleting (for history archive)
    const { data: members } = await db.from('event_members').select('user_id').eq('event_id', eventId);

    if (msgIds.length > 0) {
      await db.from('event_message_reads').delete().in('event_message_id', msgIds);
      await db.from('event_message_reactions').delete().in('event_message_id', msgIds);

      // Delete attachment files from storage
      const { data: attachments } = await db.from('event_message_attachments').select('file_key').in('event_message_id', msgIds);
      const fileKeys: string[] = [];
      for (const att of (attachments || []) as Array<{ file_key: string | null }>) {
        if (att.file_key) fileKeys.push(att.file_key);
      }
      if (fileKeys.length > 0) {
        const byBucket: Record<string, string[]> = {};
        for (const fk of fileKeys) {
          const parts = fk.split('/');
          const bucket = parts[0];
          const path = parts.slice(1).join('/');
          if (!byBucket[bucket]) byBucket[bucket] = [];
          byBucket[bucket].push(path);
        }
        for (const [bucket, paths] of Object.entries(byBucket)) {
          await db.storage.from(bucket).remove(paths);
        }
      }

      await db.from('event_message_attachments').delete().in('event_message_id', msgIds);
    }

    // Delete event messages, typing status, and members
    await db.from('event_messages').delete().eq('event_id', eventId);
    await db.from('typing_status').delete().eq('group_type', 'event').eq('group_id', String(eventId));
    await db.from('event_members').delete().eq('event_id', eventId);

    // Soft-delete main chat card + remove its notifications
    if (evtRec.message_id) {
      await db.from('notifications').delete().eq('message_id', evtRec.message_id as number);
      await db.from('messages').update({
        is_deleted: true,
        content: `"${evtRec.name}" event has been deleted`,
        updated_at: new Date().toISOString(),
      }).eq('id', evtRec.message_id as number);
    }

    // Archive to event_history
    const { data: histRecord } = await db.from('event_history').insert({
      event_id: eventId,
      name: evtRec.name,
      description: evtRec.description,
      location: evtRec.location,
      start_datetime: evtRec.start_datetime,
      end_datetime: evtRec.end_datetime,
      max_members: evtRec.max_members,
      image_url: evtRec.image_url,
      creator_user_id: targetId,
      creator_name: userName,
      creator_room: (targetUser as Record<string, unknown> | null)?.room_number ?? null,
      total_attendees: (members || []).length,
      is_deleted: true,
      ended_at: new Date().toISOString(),
    }).select('id').single();

    if (histRecord && members) {
      for (const m of members) {
        await db.from('event_history_attendees').insert({
          event_history_id: (histRecord as { id: number }).id,
          user_id: (m as { user_id: string }).user_id,
        });
      }
    }

    // Delete the event itself
    await db.from('events').delete().eq('id', eventId);
  }

  // 1C. Remove user as PARTICIPANT from market listings (interested list)
  await db.from('market_listing_interested').delete().eq('user_id', targetId);

  // 1D. Delete market listings where user is the CREATOR
  const { data: userListings } = await db
    .from('market_listings')
    .select('id, title, description, type, transaction_type, is_free, price, message_id, creator_user_id, winner_user_id')
    .eq('creator_user_id', targetId);

  for (const listing of (userListings || [])) {
    const lstRec = listing as Record<string, unknown>;
    const listingId = lstRec.id as number;

    // Fetch data needed for history archive BEFORE deleting anything
    const { count: interestedCount } = await db.from('market_listing_interested')
      .select('*', { count: 'exact', head: true }).eq('listing_id', listingId);
    const { data: firstImageRow } = await db.from('market_listing_images')
      .select('image_url').eq('listing_id', listingId)
      .order('display_order', { ascending: true }).limit(1).maybeSingle();
    const firstImageUrl = (firstImageRow as Record<string, unknown> | null)?.image_url as string | null ?? null;

    // Fetch listing messages (with attachment file_keys for storage cleanup)
    const { data: listingMsgs } = await db.from('listing_messages').select('id').eq('listing_id', listingId);
    const msgIds = (listingMsgs || []).map((m: Record<string, unknown>) => m.id as number);

    if (msgIds.length > 0) {
      const { data: msgAtts } = await db.from('listing_message_attachments').select('file_key').in('listing_message_id', msgIds);
      const attFileKeys: string[] = (msgAtts || []).map((a: Record<string, unknown>) => a.file_key as string).filter(Boolean);
      if (attFileKeys.length > 0) {
        const byBucket: Record<string, string[]> = {};
        for (const fk of attFileKeys) {
          const parts = fk.split('/');
          const bucket = parts[0];
          const path = parts.slice(1).join('/');
          if (!byBucket[bucket]) byBucket[bucket] = [];
          byBucket[bucket].push(path);
        }
        for (const [bucket, paths] of Object.entries(byBucket)) {
          await db.storage.from(bucket).remove(paths);
        }
      }

      await db.from('listing_message_reads').delete().in('listing_message_id', msgIds);
      await db.from('listing_message_reactions').delete().in('listing_message_id', msgIds);
      await db.from('listing_message_attachments').delete().in('listing_message_id', msgIds);
    }

    // Delete listing messages and typing status
    await db.from('listing_messages').delete().eq('listing_id', listingId);
    await db.from('typing_status').delete().eq('group_type', 'listing').eq('group_id', String(listingId));

    // Remove all interested rows for this listing
    await db.from('market_listing_interested').delete().eq('listing_id', listingId);

    // Delete listing images from storage + table
    const { data: images } = await db.from('market_listing_images').select('image_url').eq('listing_id', listingId);
    const imgKeys: string[] = ((images || []) as Array<{ image_url: string }>).map((img) => {
      const match = img.image_url?.match(/\/storage\/v1\/object\/public\/([^?]+)/);
      return match ? match[1] : null;
    }).filter(Boolean) as string[];
    if (imgKeys.length > 0) {
      const byBucket: Record<string, string[]> = {};
      for (const fk of imgKeys) {
        const parts = fk.split('/');
        const bucket = parts[0];
        const path = parts.slice(1).join('/');
        if (!byBucket[bucket]) byBucket[bucket] = [];
        byBucket[bucket].push(path);
      }
      for (const [bucket, paths] of Object.entries(byBucket)) {
        await db.storage.from(bucket).remove(paths);
      }
    }
    await db.from('market_listing_images').delete().eq('listing_id', listingId);

    // Soft-delete main chat card + remove its notifications
    if (lstRec.message_id) {
      await db.from('notifications').delete().eq('message_id', lstRec.message_id as number);
      await db.from('messages').update({
        is_deleted: true,
        content: `"${lstRec.title}" request has been deleted`,
        updated_at: new Date().toISOString(),
      }).eq('id', lstRec.message_id as number);
    }

    // Archive listing to market_listing_history (using pre-fetched counts/image from above)
    const { data: existingHistory } = await db.from('market_listing_history')
      .select('id').eq('listing_id', listingId).maybeSingle();

    if (existingHistory) {
      await db.from('market_listing_history').update({
        is_deleted: true,
        total_interested: interestedCount || 0,
        winner_user_id: lstRec.winner_user_id ?? null,
        ended_at: new Date().toISOString(),
      }).eq('listing_id', listingId);
    } else {
      await db.from('market_listing_history').insert({
        listing_id: listingId,
        title: lstRec.title,
        description: lstRec.description,
        type: lstRec.type,
        transaction_type: lstRec.transaction_type,
        is_free: lstRec.is_free,
        price: lstRec.price,
        image_url: firstImageUrl,
        creator_user_id: targetId,
        creator_name: userName,
        creator_room: (targetUser as Record<string, unknown> | null)?.room_number ?? null,
        total_interested: interestedCount || 0,
        winner_user_id: lstRec.winner_user_id ?? null,
        winner_name: null,
        winner_room: null,
        is_deleted: true,
        ended_at: new Date().toISOString(),
      });
    }

    // Delete the listing itself
    await db.from('market_listings').delete().eq('id', listingId);
  }

  // ─── STEP 2: CLEAN UP REMAINING USER DATA ────────────────────────────────

  await db.from('reactions').delete().eq('user_id', targetId);
  await db.from('notifications').delete().or(`user_id.eq.${targetId},mentioned_by_user_id.eq.${targetId}`);
  await db.from('message_reads').delete().eq('user_id', targetId);
  await db.from('system_messages').delete().eq('user_id', targetId);
  await db.from('event_message_reads').delete().eq('user_id', targetId);
  await db.from('event_message_reactions').delete().eq('user_id', targetId);
  await db.from('email_notification_users').delete().eq('user_id', targetId);
  // Remove from any remaining event_members (events not created by user, not caught by 1A neq filter edge cases)
  await db.from('event_members').delete().eq('user_id', targetId);

  // ─── STEP 3: SOFT-DELETE USER RECORD ─────────────────────────────────────

  await db.from('users').update({
    name: 'Deleted User',
    email: `deleted_${targetId}@deleted.com`,
    avatar_url: null,
    room_number: null,
    is_deleted: true,
    is_active: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', targetId);

  // ─── STEP 4: INVALIDATE SESSION ──────────────────────────────────────────

  // Keep Supabase Auth account so they can re-register with the same email
  await db.auth.admin.signOut(targetId, 'global');

  // ─── STEP 5: AUDIT LOG + EMAIL ────────────────────────────────────────────

  if (targetUser) {
    await db.from('system_messages').insert({
      type: 'user_deleted',
      user_id: targetId,
      message: `${userName} was deleted`,
      metadata: JSON.stringify({
        message_type: 'user_deleted',
        name: userName,
        room_number: (targetUser as Record<string, unknown>).room_number,
      }),
    });

    if (userEmail?.includes('@')) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nextdoor.website';
      const { subject, html } = buildAccountDeletedEmail(userName || 'there', appUrl);
      await sendEmail(userEmail, subject, html);
    }
  }

  return json({ success: true });
}
