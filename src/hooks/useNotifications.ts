import { useState, useEffect, useRef } from "react";
import { usePolling } from "@/src/hooks/usePolling";

export function useNotifications(unreadMessageCount: number = 0, groupId?: string) {
  const [unreadMentionCount, setUnreadMentionCount] = useState(0);
  const [adminReminderCount, setAdminReminderCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const prevCountRef = useRef<number>(0);
  const isInitialFetchRef = useRef(true);

  const fetchUnreadCount = async () => {
    try {
      const url = groupId
        ? `/api/notifications/unread/count?group_id=${encodeURIComponent(groupId)}`
        : "/api/notifications/unread/count";
      const [notifRes, remindersRes] = await Promise.all([
        fetch(url, { credentials: 'include' }),
        fetch("/api/admin-reminders", { credentials: 'include' }),
      ]);

      if (notifRes.ok) {
        const data = await notifRes.json();
        setUnreadMentionCount(data.count || 0);
      }

      if (remindersRes.ok) {
        const data = await remindersRes.json();
        setAdminReminderCount((data.reminders || []).length);
      }

      prevCountRef.current = unreadMentionCount;
      isInitialFetchRef.current = false;
    } catch (error) {
      console.error("Error fetching unread count:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Poll for new notifications every 10 seconds
  usePolling(fetchUnreadCount, 10000);

  // Total count includes mentions + admin reminders + unread messages indicator (1 if any)
  const totalCount = unreadMentionCount + adminReminderCount + (unreadMessageCount > 0 ? 1 : 0);

  return {
    unreadCount: totalCount,
    unreadMentionCount,
    isLoading,
    refetch: fetchUnreadCount,
  };
}
