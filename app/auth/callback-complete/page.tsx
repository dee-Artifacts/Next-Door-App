'use client';

import { useEffect } from "react";
import { useAuth } from "@/src/lib/auth-hook";
import { trackOnce } from "@/src/lib/analytics";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const { user, isPending, exchangeCodeForSessionToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        await exchangeCodeForSessionToken();

        // Only proceed once the auth state has settled
        if (!isPending) {
          if (!user) {
            // Session cookie was not received - go back to login
            router.push("/");
            return;
          }

          const profileResponse = await fetch("/api/profile", { credentials: 'include' });

          // A non-OK response (e.g. 401) means the session isn't recognised yet.
          // Avoid misreading an error JSON as "profile not completed" which would
          // push to /profile/setup → no user → push back to / (infinite loop).
          if (!profileResponse.ok) {
            router.push("/");
            return;
          }

          const profileData = await profileResponse.json();
          trackOnce("nd_demo_entered", "demo-entered", { method: "google" });
          if (profileData.profile_completed) router.push("/chat");
          else router.push("/profile/setup");
        }
      } catch (error) {
        console.error("Auth error:", error);
        router.push("/");
      }
    };

    handleCallback();
  }, [isPending, user]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center">
      <div className="text-white text-xl">Signing you in...</div>
    </div>
  );
}
