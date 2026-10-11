import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { getListingUnreadCounts } from '@/src/lib/unread';

// Single-listing count; the Market page uses /api/listings/unread-counts for all of them at once
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const { id } = await params;
  const listingId = parseInt(id);

  const counts = await getListingUnreadCounts(getServiceClient(), userId, [listingId]);
  return json({ count: counts[listingId] ?? 0 });
}
