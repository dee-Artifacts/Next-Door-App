/**
 * Page activity tracker shared by every poller (see usePolling).
 *
 *   active - tab visible and the user gave input in the last IDLE_AFTER_MS
 *   idle   - tab visible but no input for IDLE_AFTER_MS
 *   hidden - tab in the background, minimised, or being unloaded
 *
 * Any input, focus or the tab becoming visible again flips straight back to
 * "active", which pollers treat as a cue to catch up immediately.
 */

export type ActivityState = 'active' | 'idle' | 'hidden';
type Listener = (next: ActivityState, prev: ActivityState) => void;

export const IDLE_AFTER_MS = 5 * 60 * 1000;

// pointermove/scroll/wheel fire constantly; only look at them this often.
const NOISY_EVENT_THROTTLE_MS = 1000;

let state: ActivityState = 'active';
let lastInputAt = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let initialised = false;
const listeners = new Set<Listener>();

function isVisible() {
  return document.visibilityState === 'visible';
}

function setState(next: ActivityState) {
  if (next === state) return;
  const prev = state;
  state = next;
  listeners.forEach((listener) => listener(next, prev));
}

function scheduleIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (isVisible()) setState('idle');
  }, IDLE_AFTER_MS);
}

function markActive() {
  lastInputAt = Date.now();
  if (isVisible()) setState('active');
  scheduleIdle();
}

function onNoisyInput() {
  if (state === 'active' && Date.now() - lastInputAt < NOISY_EVENT_THROTTLE_MS) return;
  markActive();
}

function onVisibilityChange() {
  if (isVisible()) {
    markActive();
  } else {
    if (idleTimer) clearTimeout(idleTimer);
    setState('hidden');
  }
}

function onPageHide() {
  if (idleTimer) clearTimeout(idleTimer);
  setState('hidden');
}

function init() {
  if (initialised || typeof document === 'undefined') return;
  initialised = true;

  state = isVisible() ? 'active' : 'hidden';
  lastInputAt = Date.now();
  if (state === 'active') scheduleIdle();

  const passive = { passive: true, capture: true } as const;
  for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(type, markActive, passive);
  }
  for (const type of ['pointermove', 'wheel', 'scroll'] as const) {
    window.addEventListener(type, onNoisyInput, passive);
  }
  window.addEventListener('focus', markActive);
  window.addEventListener('pageshow', markActive);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

export function getActivityState(): ActivityState {
  init();
  return state;
}

export function subscribeActivity(listener: Listener): () => void {
  init();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
