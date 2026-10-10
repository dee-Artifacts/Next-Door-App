import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { isEventDissolved } from '@/src/lib/events';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const db = getServiceClient();
  const eventId = parseInt(id);

  const { data: membership } = await db.from('event_members').select('id').eq('event_id', eventId).eq('user_id', userId).maybeSingle();
  if (!membership) return json({ count: 0 });

  const { data: evt } = await db.from('events').select('end_datetime').eq('id', eventId).maybeSingle();
  if (!evt || isEventDissolved(evt.end_datetime)) return json({ count: 0 });

  // Count messages from others with no read receipt by this user
  const { data: allMsgIds } = await db.from('event_messages')
    .select('id')
    .eq('event_id', eventId)
    .neq('user_id', userId);

  const { data: readIds } = await db.from('event_message_reads')
    .select('event_message_id')
    .eq('user_id', userId);

  const readSet = new Set((readIds || []).map((r: { event_message_id: number }) => r.event_message_id));
  const unreadCount = (allMsgIds || []).filter((m: { id: number }) => !readSet.has(m.id)).length;

  return json({ count: unreadCount });
}
