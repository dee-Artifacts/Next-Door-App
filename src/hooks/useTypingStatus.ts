import { useState, useEffect, useCallback, useRef } from "react";
import { usePolling } from "@/src/hooks/usePolling";

interface TypingUser {
  user_id: string;
  name: string;
  avatar_url: string | null;
  room_number: string | null;
}

interface UseTypingStatusOptions {
  groupType: "main" | "event" | "listing";
  groupId?: string;
  enabled?: boolean;
}

export function useTypingStatus({ groupType, groupId, enabled = true }: UseTypingStatusOptions) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const lastSentRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUserIdsRef = useRef<string>("");

  const fetchTypingUsers = useCallback(async () => {
      try {
        const params = new URLSearchParams();
        if (groupId) {
          params.set("group_id", groupId);
        }
        const url = `/api/typing/${groupType}${params.toString() ? `?${params}` : ""}`;
        const response = await fetch(url, { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          // Deduplicate by user_id to prevent flickering
          const users = data.typing_users || [];
          const uniqueUsers = users.filter(
            (user: TypingUser, index: number, self: TypingUser[]) =>
              self.findIndex((u) => u.user_id === user.user_id) === index
          );
          
          // Only update state if the user IDs have actually changed (prevents flickering)
          const newUserIds = uniqueUsers.map((u: TypingUser) => u.user_id).sort().join(",");
          if (newUserIds !== prevUserIdsRef.current) {
            prevUserIdsRef.current = newUserIds;
            setTypingUsers(uniqueUsers);
          }
        }
      } catch (error) {
        console.error("Failed to fetch typing status:", error);
      }
  }, [groupType, groupId]);

  // Fetch typing users periodically
  useEffect(() => {
    if (!enabled) {
      setTypingUsers([]);
      prevUserIdsRef.current = "";
      return;
    }
    fetchTypingUsers();
  }, [enabled, fetchTypingUsers]);

  // Poll every 2 seconds
  usePolling(fetchTypingUsers, 2000, { enabled });

  // Send typing status (debounced - max once per 3 seconds)
  const sendTypingStatus = useCallback(async () => {
    if (!enabled) return;

    const now = Date.now();
    const timeSinceLastSent = now - lastSentRef.current;

    // Only send if 3 seconds have passed since last send
    if (timeSinceLastSent < 3000) {
      // Schedule a send for later if not already scheduled
      if (!debounceTimeoutRef.current) {
        debounceTimeoutRef.current = setTimeout(() => {
          debounceTimeoutRef.current = null;
          sendTypingStatus();
        }, 3000 - timeSinceLastSent);
      }
      return;
    }

    lastSentRef.current = now;

    try {
      await fetch("/api/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          group_type: groupType,
          group_id: groupId,
        }),
      });
    } catch (error) {
      console.error("Failed to send typing status:", error);
    }
  }, [groupType, groupId, enabled]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return {
    typingUsers,
    sendTypingStatus,
  };
}
