import { useState, useEffect, useCallback, useRef } from "react";
import { usePolling } from "@/src/hooks/usePolling";
import { stopIfDenied } from "@/src/lib/session-guard";
import type { MessageCursor, MessageLike } from "@/src/hooks/useMessageCursor";

export const IDLE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
// While Realtime is live: a safety check for what sends no signal (reminders
// and announcements expiring, events ending) or a signal that got lost.
export const LIVE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

interface UseChatSyncOptions<M extends MessageLike> {
  /** Which chat to check for changes while idle: "main", "event:<id>" or "listing:<id>". */
  chat?: string;
  /** The chat's message cursor (useMessageCursor); changes are merged through it. */
  cursor?: MessageCursor<M>;
  /** Poll the header badge counts every 30s while active (main chat only). */
  withCounts?: boolean;
  /** The chat's Realtime topic is live: no polling except a 10-minute safety check. */
  live?: boolean;
}

/**
 * Keeps a chat screen current through /api/sync:
 *   - active tab: header counts every 30s (if `withCounts`)
 *   - idle tab (no input for 5 min): ONE request every 5 minutes that returns
 *     both the counts and what changed in `chat`; nothing else polls
 *   - hidden tab: nothing
 *   - Realtime live (`live`): only a check every 10 minutes; the chat calls
 *     `refresh` when a signal arrives
 * Any input brings every poller back to its normal rate with an immediate catch-up.
 */
export function useChatSync<M extends MessageLike>({
  chat,
  cursor,
  withCounts = false,
  live = false,
}: UseChatSyncOptions<M> = {}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [mentionCount, setMentionCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);

  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const sync = useCallback(async (includeMessages: boolean) => {
    try {
      // Messages only once the chat has loaded (the cursor has something to send)
      const ticket = includeMessages && chat ? cursorRef.current?.begin() : undefined;
      const withMessages = !!ticket && !ticket.full;
      const params = withMessages ? ticket.params : new URLSearchParams();
      if (withMessages) params.set("chat", chat!);
      const query = params.toString();
      const response = await fetch(`/api/sync${query ? `?${query}` : ""}`, { credentials: "include" });
      if (!response.ok) return stopIfDenied(response);
      const data = await response.json();
      setUnreadCount(data.unread_count || 0);
      setMentionCount(data.mention_count || 0);
      setReminderCount(data.reminder_count || 0);
      if (withMessages && Array.isArray(data.messages)) {
        cursorRef.current?.apply(ticket, data.messages, data.cursor);
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
    (mode) => (live || mode === "idle" ? sync(true) : fetchCounts()),
    live ? LIVE_CHECK_INTERVAL_MS : withCounts ? 30_000 : null,
    { enabled: withCounts || !!chat, idleIntervalMs: live ? LIVE_CHECK_INTERVAL_MS : IDLE_SYNC_INTERVAL_MS }
  );

  /** Counts plus what changed in `chat`, in one request (answers a Realtime signal). */
  const refresh = useCallback(() => sync(true), [sync]);

  // Bell total: mentions + admin reminders + an "unread messages" entry (1 if any)
  const notificationCount = mentionCount + reminderCount + (unreadCount > 0 ? 1 : 0);

  return {
    unreadCount,
    notificationCount,
    refetchCounts: fetchCounts,
    refresh,
  };
}
