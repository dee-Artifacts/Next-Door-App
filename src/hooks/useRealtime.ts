import { useCallback, useEffect, useRef, useState } from "react";
import { listen, type Signal } from "@/src/lib/realtime";
import { getActivityState, subscribeActivity } from "@/src/lib/activity";
import { isSessionEnded } from "@/src/lib/session-guard";

/**
 * Listen on a Realtime topic (see src/lib/realtime) while mounted; null
 * listens to nothing. Returns true while the channel is SUBSCRIBED: pollers
 * stand down then, and resume as soon as it is not.
 */
export function useRealtime(topic: string | null, onSignal: (signal: Signal) => void): boolean {
  const [live, setLive] = useState(false);
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  useEffect(() => {
    if (!topic) {
      setLive(false);
      return;
    }
    return listen(
      topic,
      (signal) => onSignalRef.current(signal),
      (status) => setLive(status === "live")
    );
  }, [topic]);

  return live;
}

// Signals often come in bursts (a message, then its read receipts); one fetch covers them.
const SIGNAL_DEBOUNCE_MS = 300;

/**
 * Returns `trigger`, which runs `refresh` once for a burst of signals, never
 * two at a time. While the tab is hidden it only notes that something
 * changed and refreshes when the tab is visible again. Also refreshes once
 * whenever `live` turns true: the catch-up for anything missed while the
 * channel was down.
 */
export function useSignalRefresh(refresh: () => unknown, live: boolean) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const state = useRef({ timer: null as ReturnType<typeof setTimeout> | null, running: false, again: false, dirty: false });

  const trigger = useCallback(() => {
    const s = state.current;
    if (isSessionEnded()) return;
    if (getActivityState() === "hidden") {
      s.dirty = true;
      return;
    }
    if (s.running) {
      s.again = true;
      return;
    }
    if (s.timer) return;
    s.timer = setTimeout(async () => {
      s.timer = null;
      s.running = true;
      try {
        await refreshRef.current();
      } catch (err) {
        console.error("[realtime] refresh failed:", err);
      } finally {
        s.running = false;
      }
      if (s.again) {
        s.again = false;
        trigger();
      }
    }, SIGNAL_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (live) trigger();
  }, [live, trigger]);

  useEffect(
    () =>
      subscribeActivity((next) => {
        const s = state.current;
        if (next !== "hidden" && s.dirty) {
          s.dirty = false;
          trigger();
        }
      }),
    [trigger]
  );

  useEffect(
    () => () => {
      if (state.current.timer) clearTimeout(state.current.timer);
    },
    []
  );

  return trigger;
}
