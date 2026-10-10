import { authenticate, getServiceClient, json, error } from '@/src/lib/api-helpers';
import { loadUnarchivedEventHistory } from '@/src/lib/events';

export async function GET() {
  const userId = await authenticate();
  if (!userId) return error('Unauthorized', 401);
  const db = getServiceClient();
  const [{ data }, unarchived] = await Promise.all([
    db.from('event_history').select('*').order('ended_at', { ascending: false }),
    loadUnarchivedEventHistory(db),
  ]);
  // Dissolved events the monthly cleanup hasn't archived yet show up here too
  const merged = [...unarchived, ...((data || []) as Record<string, unknown>[])];
  merged.sort((a, b) => new Date(b.ended_at as string).getTime() - new Date(a.ended_at as string).getTime());
  return json(merged);
}
