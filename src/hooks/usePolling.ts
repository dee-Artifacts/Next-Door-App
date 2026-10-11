import { useEffect, useRef } from "react";
import { getActivityState, subscribeActivity, type ActivityState } from "@/src/lib/activity";
import { isSessionEnded, STOP_POLLING } from "@/src/lib/session-guard";

type PollMode = Exclude<ActivityState, 'hidden'>;
type PollFn = (mode: PollMode) => unknown;

interface UsePollingOptions {
  /** Set false to stop polling entirely (e.g. no user yet, panel closed). */
  enabled?: boolean;
  /** Interval while the tab is visible but idle. null (default) = don't poll while idle. */
  idleIntervalMs?: number | null;
  /** Run at once when the user comes back (default). False while Realtime keeps the data current. */
  catchUpOnReturn?: boolean;
  /**
   * This poll stands in for Realtime (`activeIntervalMs` is null while live):
   * when it starts again because Realtime went down, it runs at once.
   */
  fallback?: boolean;
}

/**
 * Poll an API without wasting server work:
 *   - runs every `activeIntervalMs` only while the tab is visible and in use
 *   - runs every `idleIntervalMs` (or not at all) while the tab is visible but idle
 *   - never runs while the tab is hidden
 *   - runs once immediately when the user comes back (input, focus, tab shown),
 *     unless `catchUpOnReturn` is false
 *   - with `fallback`, runs once immediately when `activeIntervalMs` goes from
 *     null back to a number (Realtime went down: polling starts with a catch-up)
 *   - never overlaps itself: the next tick is scheduled after the previous one ends
 *   - stops for good when the callback returns STOP_POLLING (or an array containing
 *     it, for Promise.all), or once the session has ended (see session-guard)
 *
 * The first fetch on mount stays with the caller; this hook only handles the repeats.
 * `callback` may change every render; the latest one is always used.
 */
export function usePolling(
  callback: PollFn,
  activeIntervalMs: number | null,
  { enabled = true, idleIntervalMs = null, catchUpOnReturn = true, fallback = false }: UsePollingOptions = {}
) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  const catchUpRef = useRef(catchUpOnReturn);
  catchUpRef.current = catchUpOnReturn;
  // The active interval of the previous run of the effect below (undefined before the first)
  const lastActiveMs = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let disposed = false;
    let stopped = false;

    const intervalFor = (state: ActivityState) =>
      state === 'active' ? activeIntervalMs : state === 'idle' ? idleIntervalMs : null;

    const run = async (mode: PollMode) => {
      if (inFlight || disposed || stopped) return;
      if (isSessionEnded()) {
        stopped = true;
        return;
      }
      inFlight = true;
      try {
        const result = await callbackRef.current(mode);
        if (result === STOP_POLLING || (Array.isArray(result) && result.includes(STOP_POLLING))) {
          stopped = true;
        }
      } catch (err) {
        console.error('[usePolling] poll failed:', err);
      } finally {
        inFlight = false;
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (disposed || stopped) return;
      const ms = intervalFor(getActivityState());
      if (ms == null) return;
      timer = setTimeout(async () => {
        const state = getActivityState();
        if (state !== 'hidden' && intervalFor(state) != null) await run(state);
        schedule();
      }, ms);
    };

    const unsubscribe = subscribeActivity(async (next, prev) => {
      if (next === 'active' && prev !== 'active' && activeIntervalMs != null && catchUpRef.current) {
        // Coming back: catch up now rather than waiting a full interval.
        if (timer) clearTimeout(timer);
        timer = null;
        await run('active');
      }
      schedule();
    });

    const resumed = fallback && lastActiveMs.current === null && activeIntervalMs != null;
    lastActiveMs.current = activeIntervalMs;
    const now = getActivityState();
    if (resumed && now !== 'hidden' && intervalFor(now) != null) {
      void run(now).then(schedule);
    } else {
      schedule();
    }

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled, activeIntervalMs, idleIntervalMs, fallback]);
}
