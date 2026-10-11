import { useState, useEffect, useCallback, useRef } from "react";
import type { Message, SystemMessage } from "@/src/lib/types";
import type { TypingUser } from "@/src/hooks/useTypingStatus";
import { useMessageCursor } from "@/src/hooks/useMessageCursor";
import { stopIfDenied } from "@/src/lib/session-guard";

type MessageOrSystem = Message | SystemMessage;

interface UseMessagesOptions {
  /** Receives `typing_users` from each fetch (the messages poll doubles as the typing poll). */
  onTypingUsers?: (users: TypingUser[]) => void;
}

export function useMessages(groupId?: string | null, { onTypingUsers }: UseMessagesOptions = {}) {
  const [messages, setMessages] = useState<MessageOrSystem[]>([]);
  const [lastReadMessageId, setLastReadMessageId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const hasInitiallyLoadedRef = useRef(false);
  const onTypingUsersRef = useRef(onTypingUsers);
  onTypingUsersRef.current = onTypingUsers;
  // First fetch loads the whole chat; later ones only what changed
  const cursor = useMessageCursor<MessageOrSystem>(groupId || "main", setMessages);

  const fetchMessages = useCallback(async () => {
    try {
      const ticket = cursor.begin();
      if (groupId) ticket.params.set("group_id", groupId);
      const query = ticket.params.toString();
      const url = `/api/messages${query ? `?${query}` : ""}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        const stop = await stopIfDenied(response);
        if (stop) return stop;
        console.error(`[useMessages] Response not OK: ${response.status} ${response.statusText}`);
        throw new Error("Failed to fetch messages");
      }
      const data = await response.json();

      // Ensure we always have an array
      const messageArray = data.messages || data;
      if (!Array.isArray(messageArray)) {
        console.error(`[useMessages] Expected array but got:`, typeof messageArray, messageArray);
        // On error, keep previous messages instead of clearing
        // Only clear if this is the initial load
        if (!hasInitiallyLoadedRef.current) {
          setMessages([]);
        }
      } else {
        cursor.apply(ticket, messageArray, data.cursor);
      }

      setLastReadMessageId(data.last_read_message_id || null);
      onTypingUsersRef.current?.(data.typing_users || []);
      hasInitiallyLoadedRef.current = true;
      setHasInitiallyLoaded(true);
    } catch (error) {
      console.error("[useMessages] Error fetching messages:", error);
      // On error during polling, keep previous messages visible
      // Only set empty array if this is the first load attempt
      if (!hasInitiallyLoadedRef.current) {
        setMessages([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [groupId, cursor]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return {
    messages,
    /** Shared with the idle check (useChatSync) so it fetches only what changed too. */
    cursor,
    lastReadMessageId,
    isLoading,
    hasInitiallyLoaded,
    refetch: fetchMessages,
  };
}
