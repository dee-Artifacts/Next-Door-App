import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { getMainUnreadCount } from '@/src/lib/unread';

export async function GET() {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  return json({ count: await getMainUnreadCount(getServiceClient(), userId) });
}
