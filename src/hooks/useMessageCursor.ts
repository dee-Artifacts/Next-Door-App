import { useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from "react";

export interface MessageLike {
  id?: number | string;
  type?: string;
  created_at?: string;
}

export interface FetchTicket {
  /** Send these with the fetch: empty for a full load, else `after` and `since`. */
  params: URLSearchParams;
  full: boolean;
  generation: number;
}

export interface MessageCursor<M> {
  /** Start a fetch. */
  begin: () => FetchTicket;
  /** Apply what a fetch returned, with the response's `cursor`. */
  apply: (ticket: FetchTicket, incoming: M[], cursor?: string) => void;
  /** Forget everything: the next fetch is a full load. */
  reset: () => void;
}

/** Newest real message id (system messages in the main chat have their own id sequence). */
function latestMessageId(messages: MessageLike[]): number {
  let max = 0;
  for (const m of messages) {
    if (m.type === "system") continue;
    const id = typeof m.id === "number" ? m.id : 0;
    if (id > max) max = id;
  }
  return max;
}

function timeOf(m: MessageLike) {
  return m.created_at ? new Date(m.created_at).getTime() : 0;
}

/** Replace messages already in the list (same type and id), add the rest, keep time order. */
export function upsertMessages<M extends MessageLike>(current: M[], incoming: M[]): M[] {
  if (incoming.length === 0) return current;
  const key = (m: M) => `${m.type ?? ""}:${m.id}`;
  const index = new Map(current.map((m, i) => [key(m), i]));
  const next = current.slice();
  let added = false;
  for (const m of incoming) {
    const i = index.get(key(m));
    if (i === undefined) {
      index.set(key(m), next.length);
      next.push(m);
      added = true;
    } else {
      next[i] = m;
    }
  }
  if (added) next.sort((a, b) => timeOf(a) - timeOf(b));
  return next;
}

/**
 * Tracks where a chat's message list is up to, so polls fetch only what
 * changed: the first fetch loads the whole chat, later ones send `after` (the
 * newest id held) and `since` (the server's cursor from the previous
 * response) and merge the result by id. Messages are never removed, only
 * soft-deleted, so merging is enough. A new `chatKey` starts over.
 */
export function useMessageCursor<M extends MessageLike>(
  chatKey: string,
  setMessages: Dispatch<SetStateAction<M[]>>
): MessageCursor<M> {
  const state = useRef({ key: chatKey, generation: 0, after: 0, since: null as string | null });
  if (state.current.key !== chatKey) {
    state.current = { key: chatKey, generation: state.current.generation + 1, after: 0, since: null };
  }

  const begin = useCallback((): FetchTicket => {
    const s = state.current;
    const params = new URLSearchParams();
    if (s.since) {
      params.set("after", String(s.after));
      params.set("since", s.since);
    }
    return { params, full: !s.since, generation: s.generation };
  }, []);

  const apply = useCallback((ticket: FetchTicket, incoming: M[], cursor?: string) => {
    const s = state.current;
    // The chat changed or was reset while this fetch was out
    if (ticket.generation !== s.generation) return;
    // A full load replaces the list, unless a newer load already landed
    const replace = ticket.full && !s.since;
    setMessages((prev) => (replace ? incoming : upsertMessages(prev, incoming)));
    s.after = Math.max(s.after, latestMessageId(incoming));
    if (cursor && (!s.since || cursor > s.since)) s.since = cursor;
  }, [setMessages]);

  const reset = useCallback(() => {
    const s = state.current;
    state.current = { key: s.key, generation: s.generation + 1, after: 0, since: null };
  }, []);

  return useMemo(() => ({ begin, apply, reset }), [begin, apply, reset]);
}
