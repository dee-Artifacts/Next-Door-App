import { useState, useEffect, useCallback, useRef } from "react";
import type { Message, SystemMessage } from "@/src/lib/types";
import type { TypingUser } from "@/src/hooks/useTypingStatus";
import { mergeNewMessages } from "@/src/hooks/useChatSync";

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

  const fetchMessages = useCallback(async () => {
    try {
      const url = groupId ? `/api/messages?group_id=${encodeURIComponent(groupId)}` : "/api/messages";
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
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
        setMessages(messageArray);
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
  }, [groupId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // New messages from the idle check (/api/sync); the next full fetch reconciles everything.
  const appendMessages = useCallback((incoming: MessageOrSystem[]) => {
    setMessages((prev) => mergeNewMessages(prev, incoming));
  }, []);

  return {
    messages,
    appendMessages,
    lastReadMessageId,
    isLoading,
    hasInitiallyLoaded,
    refetch: fetchMessages,
  };
}
