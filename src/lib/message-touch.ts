/**
 * Chats poll for messages changed since their last fetch, using each
 * message's updated_at (see the `since` option in chat-messages). Anything
 * that changes how a message renders without editing the message row itself
 * (reactions, pins, the event/listing card it shows) bumps updated_at here.
 */

import { getServiceClient } from '@/src/lib/api-helpers';

type Db = ReturnType<typeof getServiceClient>;
type MessageTable = 'messages' | 'event_messages' | 'listing_messages';

export async function touchMessage(db: Db, table: MessageTable, id: number | null | undefined) {
  if (!id) return;
  await db.from(table).update({ updated_at: new Date().toISOString() }).eq('id', id);
}

/** The event's card in the main chat changed (members joined or left). */
export async function touchEventCard(db: Db, eventId: number) {
  const { data } = await db.from('events').select('message_id').eq('id', eventId).maybeSingle();
  await touchMessage(db, 'messages', data?.message_id);
}

/** The listing's card in the main chat changed (interest, status, winner). */
export async function touchListingCard(db: Db, listingId: number) {
  const { data } = await db.from('market_listings').select('message_id').eq('id', listingId).maybeSingle();
  await touchMessage(db, 'messages', data?.message_id);
}
