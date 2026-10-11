'use client';

import { createClient } from '@/src/lib/supabase/client';
import { useRouter } from 'next/navigation';

// Always shows the message: blocked users arrive here already signed out
// (session-guard signs out first; middleware clears the cookies).
export default function BlockedPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await createClient().auth.signOut();
    } catch {
      // Already signed out
    }
    router.replace('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-light-bg via-slate-100 to-slate-50 dark:from-dark-ocean dark:via-dark-surface dark:to-dark-elevated flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-dark-surface rounded-2xl shadow-soft-lg p-8 text-center">
        <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🚫</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white font-nura mb-2">
          Account Blocked
        </h1>
        <p className="text-slate-600 dark:text-slate-300 font-outfit mb-6">
          Your account has been blocked. Please contact{' '}
          <a
            href="mailto:deepakkrishnar1618@gmail.com"
            className="text-primary-mint hover:text-primary-pine underline font-medium"
          >
            deepakkrishnar1618@gmail.com
          </a>{' '}
          for further action.
        </p>
        <button
          onClick={handleSignOut}
          className="w-full bg-gradient-primary text-white font-semibold py-3 px-6 rounded-button-rect transition-all hover:scale-105 shadow-soft font-outfit"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
