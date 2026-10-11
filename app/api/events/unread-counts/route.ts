import { NextRequest } from 'next/server';
import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { getEventUnreadCounts, parseIdList } from '@/src/lib/unread';

/** Unread counts for several event chats in one request: ?ids=1,2,3 → { counts: { "1": 0, ... } } */
export async function GET(request: NextRequest) {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const ids = parseIdList(request.nextUrl.searchParams.get('ids'));
  if (ids.length === 0) return json({ counts: {} });
  return json({ counts: await getEventUnreadCounts(getServiceClient(), userId, ids) });
}
