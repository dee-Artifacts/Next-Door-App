import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { isEventDissolved } from '@/src/lib/events';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();

  const { data: evt } = await db.from('events').select('*').eq('id', parseInt(id)).single();
  if (!evt || isEventDissolved(evt.end_datetime)) return error('Event not found', 404);

  const { data: creatorUser } = await db.from('users').select('name, is_deleted, is_active').eq('id', evt.creator_user_id).maybeSingle();
  const { count } = await db.from('event_members').select('*', { count: 'exact', head: true }).eq('event_id', evt.id);
  const { data: membership } = await db.from('event_members').select('id').eq('event_id', evt.id).eq('user_id', userId).maybeSingle();

  return json({
    ...evt,
    creator_name: creatorUser?.name ?? null,
    creator_is_deleted: creatorUser?.is_deleted ?? null,
    creator_is_active: creatorUser?.is_active ?? null,
    current_members: count || 0,
    is_joined: !!membership,
    is_creator: evt.creator_user_id === userId,
    is_expired: new Date() > new Date(evt.end_datetime),
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const eventId = parseInt(id);

  const { data: evt } = await db.from('events').select('*').eq('id', eventId).single();
  if (!evt) return error('Event not found', 404);

  const { data: caller } = await db.from('users').select('is_admin').eq('id', userId).single();
  const isAdmin = caller?.is_admin === 1 || caller?.is_admin === true;
  if (evt.creator_user_id !== userId && !isAdmin) return error('Only the creator can delete this event', 403);

  // Archive to history first, while the member list still exists.
  // Skipped if a previous attempt already archived this event.
  const { data: members } = await db.from('event_members').select('user_id').eq('event_id', eventId);
  const { data: existingHist } = await db.from('event_history').select('id').eq('event_id', eventId).limit(1);
  if (!existingHist?.length) {
    const { data: creatorUser } = await db.from('users').select('name, room_number').eq('id', evt.creator_user_id).maybeSingle();
    const { data: histRecord, error: histError } = await db.from('event_history').insert({
      event_id: eventId, name: evt.name, description: evt.description, location: evt.location,
      start_datetime: evt.start_datetime, end_datetime: evt.end_datetime, max_members: evt.max_members,
      image_url: evt.image_url, creator_user_id: evt.creator_user_id,
      creator_name: (creatorUser as Record<string, unknown>)?.name,
      creator_room: (creatorUser as Record<string, unknown>)?.room_number,
      total_attendees: members?.length ?? 0, is_deleted: true, ended_at: new Date().toISOString(),
    }).select('id').single();
    if (histError || !histRecord) return error('Failed to archive event', 500);

    if (members && members.length > 0) {
      const { error: attendeesError } = await db.from('event_history_attendees').insert(
        members.map((m: { user_id: string }) => ({ event_history_id: (histRecord as { id: number }).id, user_id: m.user_id }))
      );
      if (attendeesError) {
        await db.from('event_history').delete().eq('id', (histRecord as { id: number }).id);
        return error('Failed to archive event', 500);
      }
    }
  }

  // Fetch all event message IDs for cascade delete
  const { data: eventMsgs } = await db.from('event_messages').select('id').eq('event_id', eventId);
  const msgIds = (eventMsgs || []).map((m: Record<string, unknown>) => m.id as number);
  // Separate query: the live DB has no FK for an embedded attachments join
  const { data: attachments } = msgIds.length > 0
    ? await db.from('event_message_attachments').select('file_key').in('event_message_id', msgIds)
    : { data: [] };

  // 1. Delete reads and reactions linked to event messages
  if (msgIds.length > 0) {
    await db.from('event_message_reads').delete().in('event_message_id', msgIds);
    await db.from('event_message_reactions').delete().in('event_message_id', msgIds);
  }

  // 2. Delete attachment files from storage
  const fileKeys: string[] = [];
  for (const att of (attachments || []) as Array<{ file_key: string | null }>) {
    if (att.file_key) fileKeys.push(att.file_key);
  }
  if (fileKeys.length > 0) {
    // file_key format: "bucket/path" - group by bucket
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

  // 3. Delete event_message_attachments rows
  if (msgIds.length > 0) {
    await db.from('event_message_attachments').delete().in('event_message_id', msgIds);
  }

  // 4. Delete event messages
  await db.from('event_messages').delete().eq('event_id', eventId);

  // 5. Delete event members
  await db.from('event_members').delete().eq('event_id', eventId);

  // 6. Delete notifications linked to the event's main chat message
  if (evt.message_id) {
    await db.from('notifications').delete().eq('message_id', evt.message_id);
    // Soft-delete the original event card from main chat, storing name for display
    await db.from('messages').update({ is_deleted: true, content: `"${evt.name}" event has been deleted`, updated_at: new Date().toISOString() }).eq('id', evt.message_id);
  }

  // 7. Delete the event itself
  await db.from('events').delete().eq('id', eventId);

  return json({ success: true });
}
