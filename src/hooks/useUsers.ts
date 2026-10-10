import { useState, useEffect } from "react";
import { usePolling } from "@/src/hooks/usePolling";

interface User {
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

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users", { credentials: 'include' });
      if (!response.ok) throw new Error("Failed to fetch users");
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

  // Poll for user status updates every 10 seconds
  usePolling(fetchUsers, 10000);

  return {
    users,
    isLoading,
    refetch: fetchUsers,
  };
}
