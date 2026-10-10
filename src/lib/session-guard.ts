/**
 * What a poller does when the API refuses it.
 *
 *   401          the session may be gone (signed out elsewhere, guest purged).
 *                Confirm with Supabase Auth; if it really is gone, sign out
 *                locally and go to the home page. A passing glitch is ignored.
 *   403 blocked  the account was blocked or deactivated: sign out, go to /blocked.
 *   403 / 404    this resource is off limits now (left the event, listing gone):
 *                stop this poller only.
 *
 * Once the session has ended every poller stops (see usePolling).
 */

import { createClient } from './supabase/client';

export const STOP_POLLING = Symbol('stop-polling');
export type StopPolling = typeof STOP_POLLING;

let sessionEnded = false;
let ending: Promise<void> | null = null;
let confirming: Promise<boolean> | null = null;

export function isSessionEnded() {
  return sessionEnded;
}

function endSession(destination: '/' | '/blocked') {
  if (ending) return ending;
  sessionEnded = true;
  ending = (async () => {
    try {
      await createClient().auth.signOut({ scope: 'local' });
    } catch {
      // Already gone; we are leaving the page anyway
    }
    window.location.replace(destination);
  })();
  return ending;
}

/** Sign out a blocked or deactivated account and send it to /blocked. */
export function handleBlockedAccount() {
  return endSession('/blocked');
}

/** True if Supabase Auth confirms the session no longer exists. */
function confirmSessionGone(): Promise<boolean> {
  if (!confirming) {
    confirming = (async () => {
      try {
        const { data, error } = await createClient().auth.getUser();
        if (data.user && !error) return false;
        // Network trouble is not proof of anything
        if (error?.name === 'AuthRetryableFetchError') return false;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { confirming = null; }, 0);
      }
    })();
  }
  return confirming;
}

const BLOCKED_ERROR = /blocked|deactivated/i;

/**
 * Call on a polled response that is not ok. Returns STOP_POLLING when the
 * poller should stop, null when it should keep going (e.g. a 500 or a 401
 * that turned out to be transient).
 */
export async function stopIfDenied(res: Response): Promise<StopPolling | null> {
  if (res.status === 401) {
    if (await confirmSessionGone()) {
      await endSession('/');
      return STOP_POLLING;
    }
    return null;
  }

  if (res.status === 403) {
    const body = await res.clone().json().catch(() => null);
    if (body && typeof body.error === 'string' && BLOCKED_ERROR.test(body.error)) {
      await handleBlockedAccount();
    }
    return STOP_POLLING;
  }

  if (res.status === 404) return STOP_POLLING;
  return null;
}
