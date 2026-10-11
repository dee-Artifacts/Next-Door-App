import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { touchEventCard } from '@/src/lib/message-touch';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const eventId = parseInt(id);

  const { data: caller } = await db.from('users').select('is_active').eq('id', userId).single();
  if (!caller || caller.is_active === 0 || caller.is_active === false) return error('Your account has been deactivated', 403);

  const { data: evt } = await db.from('events').select('creator_user_id').eq('id', eventId).single();
  if (!evt) return error('Event not found', 400);
  if (evt.creator_user_id === userId) return error('Event creators cannot leave their own events', 400);

  // Get user info for leave message
  const { data: user } = await db.from('users').select('name, room_number').eq('id', userId).single();

  await db.from('event_members').delete().eq('event_id', eventId).eq('user_id', userId);
  await touchEventCard(db, eventId);

  if (user) {
    await db.from('event_messages').insert({
      event_id: eventId, user_id: userId,
      content: `left_event:${user.name}:${user.room_number || ''}`,
    });
  }

  return json({ success: true });
}
