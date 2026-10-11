import { useCallback, useEffect, useRef, useState } from "react";
import { isResuming, listen, RESUME_GRACE_MS, type Signal } from "@/src/lib/realtime";
import { getActivityState, subscribeActivity } from "@/src/lib/activity";
import { isSessionEnded } from "@/src/lib/session-guard";

/**
 * Listen on a Realtime topic (see src/lib/realtime) while mounted; null
 * listens to nothing. Returns true while the channel is SUBSCRIBED (or
 * resuming after a long-hidden tab): pollers stand down then, and resume as
 * soon as it is not.
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
      (status) => setLive(status === "live" || status === "resuming")
    );
  }, [topic]);

  return live;
}

// Signals often come in bursts (a message, then its read receipts); one fetch covers them.
const SIGNAL_DEBOUNCE_MS = 300;
// Read receipts can wait: refreshed at most this often, or sooner with the next change.
export const READ_RECEIPT_DELAY_MS = 15_000;

/** A 'read' signal for reads by someone other than `myId` (no reader list: assume someone else). */
export function readBySomeoneElse(signal: Signal, myId: string | undefined) {
  const readers = signal.payload.user_ids;
  if (!Array.isArray(readers) || !myId) return true;
  return readers.some((id) => String(id) !== myId);
}

/**
 * Returns `trigger(withinMs?)`, which runs `refresh` at most `withinMs` from
 * now (300ms by default) and never two at a time: a burst of signals, or a
 * slow signal waiting when a quick one comes in, costs one refresh. While the
 * tab is hidden it only notes that something changed and refreshes when the
 * tab is visible again (waiting for the channels to rejoin if the tab left
 * them: their 'resumed' signal brings the refresh forward). Also refreshes
 * once whenever `live` turns true: the catch-up for anything missed while the
 * channel was down.
 */
export function useSignalRefresh(refresh: () => unknown, live: boolean) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const state = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    due: 0,
    running: false,
    again: null as number | null, // a trigger came in mid-refresh: run again within this
    dirty: false,
  });

  const trigger = useCallback((withinMs: number = SIGNAL_DEBOUNCE_MS) => {
    const s = state.current;
    if (isSessionEnded()) return;
    if (getActivityState() === "hidden") {
      s.dirty = true;
      return;
    }
    if (s.running) {
      s.again = Math.min(s.again ?? withinMs, withinMs);
      return;
    }
    const due = Date.now() + withinMs;
    if (s.timer) {
      if (s.due <= due) return; // already coming sooner
      clearTimeout(s.timer);
    }
    s.due = due;
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
      if (s.again !== null) {
        const within = s.again;
        s.again = null;
        trigger(within);
      }
    }, withinMs);
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
          trigger(isResuming() ? RESUME_GRACE_MS : undefined);
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
