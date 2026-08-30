declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, string | number | boolean>) => void;
    };
  }
}

/**
 * Report a named action to Umami. Silently does nothing when the tracker is not
 * loaded (SSR, local dev without the env var, or a blocked script), so a track()
 * call can sit anywhere in the tree and can never be the thing that breaks a render.
 *
 * Never pass personal data. Properties carry context ("footer" vs "header"), never
 * identity — no email, no name, no user ID, no free text anyone typed. Sending PII
 * through an event throws away the reason this site needs no consent banner.
 *
 * Tracker limits: event names truncate past 50 chars, string values past 500,
 * max 50 properties per event, numbers keep 4 decimal places.
 */
export function track(
  event: string,
  data?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  window.umami?.track(event, data);
}

/**
 * Report an action at most once per tab session.
 *
 * Used for demo-entered, which sits on a path that can re-run: the OAuth callback
 * effect can fire more than once, and a restored session would otherwise look like
 * a fresh arrival. sessionStorage (not localStorage) so a genuine return visit in a
 * new tab still counts.
 */
export function trackOnce(
  key: string,
  event: string,
  data?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Private mode / storage blocked — fall through and track anyway rather than
    // losing the event entirely. Worst case is a small over-count.
  }
  track(event, data);
}
