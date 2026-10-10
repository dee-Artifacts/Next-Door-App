import { useEffect, useRef } from "react";
import { getActivityState, subscribeActivity, type ActivityState } from "@/src/lib/activity";

type PollMode = Exclude<ActivityState, 'hidden'>;
type PollFn = (mode: PollMode) => unknown;

interface UsePollingOptions {
  /** Set false to stop polling entirely (e.g. no user yet, panel closed). */
  enabled?: boolean;
  /** Interval while the tab is visible but idle. null (default) = don't poll while idle. */
  idleIntervalMs?: number | null;
}

/**
 * Poll an API without wasting server work:
 *   - runs every `activeIntervalMs` only while the tab is visible and in use
 *   - runs every `idleIntervalMs` (or not at all) while the tab is visible but idle
 *   - never runs while the tab is hidden
 *   - runs once immediately when the user comes back (input, focus, tab shown)
 *   - never overlaps itself: the next tick is scheduled after the previous one ends
 *
 * The first fetch on mount stays with the caller; this hook only handles the repeats.
 * `callback` may change every render; the latest one is always used.
 */
export function usePolling(
  callback: PollFn,
  activeIntervalMs: number | null,
  { enabled = true, idleIntervalMs = null }: UsePollingOptions = {}
) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let disposed = false;

    const intervalFor = (state: ActivityState) =>
      state === 'active' ? activeIntervalMs : state === 'idle' ? idleIntervalMs : null;

    const run = async (mode: PollMode) => {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        await callbackRef.current(mode);
      } catch (err) {
        console.error('[usePolling] poll failed:', err);
      } finally {
        inFlight = false;
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (disposed) return;
      const ms = intervalFor(getActivityState());
      if (ms == null) return;
      timer = setTimeout(async () => {
        const state = getActivityState();
        if (state !== 'hidden' && intervalFor(state) != null) await run(state);
        schedule();
      }, ms);
    };

    const unsubscribe = subscribeActivity(async (next, prev) => {
      if (next === 'active' && prev !== 'active' && activeIntervalMs != null) {
        // Coming back: catch up now rather than waiting a full interval.
        if (timer) clearTimeout(timer);
        timer = null;
        await run('active');
      }
      schedule();
    });

    schedule();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled, activeIntervalMs, idleIntervalMs]);
}
