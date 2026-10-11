import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { getEventUnreadCounts } from '@/src/lib/unread';

// Single-event count; the Events page uses /api/events/unread-counts for all of them at once
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const eventId = parseInt(id);

  const counts = await getEventUnreadCounts(getServiceClient(), userId, [eventId]);
  return json({ count: counts[eventId] ?? 0 });
}
