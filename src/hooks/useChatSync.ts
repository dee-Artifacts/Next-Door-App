import { useState, useEffect, useCallback, useRef } from "react";
import { usePolling } from "@/src/hooks/usePolling";
import { stopIfDenied } from "@/src/lib/session-guard";

export const IDLE_SYNC_INTERVAL_MS = 5 * 60 * 1000;

interface MessageLike {
  id?: number | string;
  type?: string;
}

interface UseChatSyncOptions<M extends MessageLike> {
  /** Which chat to check for new messages while idle: "main", "event:<id>" or "listing:<id>". */
  chat?: string;
  /** The chat's current messages; the newest id is sent as `after`. */
  messages?: M[];
  /** Receives messages newer than the ones on screen (idle check only). */
  onNewMessages?: (messages: M[]) => void;
  /** Poll the header badge counts every 30s while active (main chat only). */
  withCounts?: boolean;
}

/** Newest real message id (system messages in the main chat have their own id sequence). */
function latestMessageId(messages: MessageLike[]): number {
  let max = 0;
  for (const m of messages) {
    if (m.type === 'system') continue;
    const id = typeof m.id === 'number' ? m.id : 0;
    if (id > max) max = id;
  }
  return max;
}

/** Merge new messages into the list, skipping any already there. */
export function mergeNewMessages<M extends MessageLike>(current: M[], incoming: M[]): M[] {
  const seen = new Set(current.map((m) => `${m.type ?? ''}:${m.id}`));
  const added = incoming.filter((m) => !seen.has(`${m.type ?? ''}:${m.id}`));
  return added.length ? [...current, ...added] : current;
}

/**
 * Keeps a chat screen current through /api/sync:
 *   - active tab: header counts every 30s (if `withCounts`)
 *   - idle tab (no input for 5 min): ONE request every 5 minutes that returns
 *     both the counts and any new messages for `chat`; nothing else polls
 *   - hidden tab: nothing
 * Any input brings every poller back to its normal rate with an immediate catch-up.
 */
export function useChatSync<M extends MessageLike>({
  chat,
  messages = [],
  onNewMessages,
  withCounts = false,
}: UseChatSyncOptions<M> = {}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [mentionCount, setMentionCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const onNewMessagesRef = useRef(onNewMessages);
  onNewMessagesRef.current = onNewMessages;

  const sync = useCallback(async (includeMessages: boolean) => {
    try {
      const params = new URLSearchParams();
      const afterId = includeMessages && chat ? latestMessageId(messagesRef.current) : 0;
      if (afterId) {
        params.set("chat", chat!);
        params.set("after", String(afterId));
      }
      const query = params.toString();
      const response = await fetch(`/api/sync${query ? `?${query}` : ""}`, { credentials: "include" });
      if (!response.ok) return stopIfDenied(response);
      const data = await response.json();
      setUnreadCount(data.unread_count || 0);
      setMentionCount(data.mention_count || 0);
      setReminderCount(data.reminder_count || 0);
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        onNewMessagesRef.current?.(data.messages);
      }
    } catch (error) {
      console.error("Error syncing chat:", error);
    }
  }, [chat]);

  const fetchCounts = useCallback(() => sync(false), [sync]);

  useEffect(() => {
    if (withCounts) fetchCounts();
  }, [withCounts, fetchCounts]);

  usePolling(
    (mode) => (mode === "idle" ? sync(true) : fetchCounts()),
    withCounts ? 30_000 : null,
    { enabled: withCounts || !!chat, idleIntervalMs: IDLE_SYNC_INTERVAL_MS }
  );

  // Bell total: mentions + admin reminders + an "unread messages" entry (1 if any)
  const notificationCount = mentionCount + reminderCount + (unreadCount > 0 ? 1 : 0);

  return {
    unreadCount,
    notificationCount,
    refetchCounts: fetchCounts,
  };
}
