import { useState, useEffect, useCallback, useRef } from "react";

export interface TypingUser {
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

// Matches the server's typing window (src/lib/typing.ts): senders re-send every 3s
const TYPING_SHOWN_FOR_MS = 8000;

/**
 * Typing indicator state, from either source:
 *   - polling: `typing_users` in each chat messages response → updateTypingUsers
 *   - Realtime: a "typing" signal per ping → addTypingUser, shown for 8s
 * This hook does not poll on its own.
 */
export function useTypingStatus({ groupType, groupId, enabled = true }: UseTypingStatusOptions) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const lastSentRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUserIdsRef = useRef<string>("");

  const updateTypingUsers = useCallback((users: TypingUser[] | undefined) => {
    // Deduplicate by user_id to prevent flickering
    const uniqueUsers = (users || []).filter(
      (user, index, self) => self.findIndex((u) => u.user_id === user.user_id) === index
    );

    // Only update state if the user IDs have actually changed (prevents flickering)
    const newUserIds = uniqueUsers.map((u) => u.user_id).sort().join(",");
    if (newUserIds !== prevUserIdsRef.current) {
      prevUserIdsRef.current = newUserIds;
      setTypingUsers(uniqueUsers);
    }
  }, []);

  useEffect(() => {
    if (!enabled) updateTypingUsers([]);
  }, [enabled, updateTypingUsers]);

  // Realtime typing pings: each keeps its user shown for TYPING_SHOWN_FOR_MS
  const signalledRef = useRef(new Map<string, { user: TypingUser; timer: ReturnType<typeof setTimeout> }>());
  const addTypingUser = useCallback((user: TypingUser) => {
    const signalled = signalledRef.current;
    const previous = signalled.get(user.user_id);
    if (previous) clearTimeout(previous.timer);
    const timer = setTimeout(() => {
      signalled.delete(user.user_id);
      updateTypingUsers(Array.from(signalled.values(), (e) => e.user));
    }, TYPING_SHOWN_FOR_MS);
    signalled.set(user.user_id, { user, timer });
    updateTypingUsers(Array.from(signalled.values(), (e) => e.user));
  }, [updateTypingUsers]);

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

  // Cleanup timeouts on unmount
  useEffect(() => {
    const signalled = signalledRef.current;
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      signalled.forEach((e) => clearTimeout(e.timer));
    };
  }, []);

  return {
    typingUsers: enabled ? typingUsers : [],
    updateTypingUsers,
    addTypingUser,
    sendTypingStatus,
  };
}
