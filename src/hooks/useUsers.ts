import { useState, useEffect } from "react";
import { usePolling } from "@/src/hooks/usePolling";
import { stopIfDenied } from "@/src/lib/session-guard";

export interface User {
  id: string;
  email: string;
  name: string | null;
  room_number: string | null;
  avatar_url: string | null;
  is_admin: number;
  is_online: number;
  last_seen_at: string | null;
  profile_completed: number;
  is_active: number;
  is_deleted?: number;
}

/** The user list, refreshed every `intervalMs` (30s, or slower while Realtime is live). */
export function useUsers(intervalMs = 30_000) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users", { credentials: 'include' });
      if (!response.ok) {
        const stop = await stopIfDenied(response);
        if (stop) return stop;
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Poll for user status updates
  usePolling(fetchUsers, intervalMs);

  return {
    users,
    isLoading,
    refetch: fetchUsers,
  };
}
