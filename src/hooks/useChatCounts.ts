import { useState, useEffect, useCallback } from "react";
import { usePolling } from "@/src/hooks/usePolling";

/**
 * Header badge counts for the main chat, fetched from /api/sync in one request
 * every 30s (replaces separate unread / notifications / admin-reminders polls).
 */
export function useChatCounts() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [mentionCount, setMentionCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);

  const fetchCounts = useCallback(async () => {
    try {
      const response = await fetch("/api/sync", { credentials: "include" });
      if (!response.ok) return;
      const data = await response.json();
      setUnreadCount(data.unread_count || 0);
      setMentionCount(data.mention_count || 0);
      setReminderCount(data.reminder_count || 0);
    } catch (error) {
      console.error("Error fetching chat counts:", error);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  usePolling(fetchCounts, 30_000);

  // Bell total: mentions + admin reminders + an "unread messages" entry (1 if any)
  const notificationCount = mentionCount + reminderCount + (unreadCount > 0 ? 1 : 0);

  return {
    unreadCount,
    notificationCount,
    refetch: fetchCounts,
  };
}
