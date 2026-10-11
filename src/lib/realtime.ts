/**
 * Supabase Realtime for the chats.
 *
 * Each chat listens on a private Broadcast topic: main, event:<id>,
 * listing:<id>, or user:<id> for one person's own signals. Database triggers
 * (supabase/realtime-broadcast.sql) send small id-only signals there, and the
 * RLS policy on realtime.messages decides who may join. A chat answers a
 * signal with one incremental fetch; while its topic is not live it falls
 * back to polling.
 *
 *   - One channel per topic, shared by everything on the page listening to it
 *     (supabase-js returns the same channel for the same topic name).
 *   - Channels join with the user's current access token, and every token
 *     refresh is passed on (realtime.setAuth), so they don't drop after an hour.
 *   - A tab hidden for a minute leaves its channels; it rejoins when visible
 *     again and the chats catch up with one fetch.
 *   - CHANNEL_ERROR / TIMED_OUT: supabase-js retries the join itself. CLOSED
 *     while still wanted: rejoin after a short pause.
 *
 * Debug: status changes are logged, and a small badge shows each topic's
 * state, in development or after localStorage.setItem('nd-debug-realtime', '1').
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from './supabase/client';
import { subscribeActivity } from './activity';

export type RealtimeStatus = 'connecting' | 'live' | 'down';
export interface Signal {
  event: string;
  payload: Record<string, unknown>;
}
type SignalListener = (signal: Signal) => void;
type StatusListener = (status: RealtimeStatus) => void;

interface Topic {
  channel: RealtimeChannel | null;
  status: RealtimeStatus;
  signals: Set<SignalListener>;
  statuses: Set<StatusListener>;
  leaveTimer: ReturnType<typeof setTimeout> | null;
  rejoinTimer: ReturnType<typeof setTimeout> | null;
}

const topics = new Map<string, Topic>();

// Set while a long-hidden tab has left its channels (see initVisibility)
let hiddenLeft = false;

// Leaving a topic waits this long, so a quick remount (React dev mode,
// switching views) reuses the channel instead of racing its removal.
const LEAVE_DELAY_MS = 1000;
const HIDDEN_LEAVE_AFTER_MS = 60_000;
const REJOIN_AFTER_CLOSE_MS = 5000;

// ── Debug ────────────────────────────────────────────────────────────────────

export function isRealtimeDebug() {
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('nd-debug-realtime') === '1';
  } catch {
    return false;
  }
}

function log(...args: unknown[]) {
  if (isRealtimeDebug()) console.info('[realtime]', ...args);
}

const debugListeners = new Set<() => void>();

/** Every topic's current status, for the debug badge. */
export function getRealtimeSnapshot(): Array<[string, RealtimeStatus]> {
  return Array.from(topics.entries()).map(([name, t]) => [name, t.status]);
}

export function subscribeRealtimeDebug(listener: () => void) {
  debugListeners.add(listener);
  return () => {
    debugListeners.delete(listener);
  };
}

function setStatus(name: string, t: Topic, status: RealtimeStatus) {
  if (t.status === status) return;
  t.status = status;
  log(name, '→', status);
  t.statuses.forEach((listener) => listener(status));
  debugListeners.forEach((listener) => listener());
}

// ── Auth ─────────────────────────────────────────────────────────────────────

let authReady: Promise<boolean> | null = null;
let authListening = false;

/** Give the Realtime connection the user's access token (needed to join private channels). */
function ensureAuth(): Promise<boolean> {
  const supabase = createClient();

  if (!authListening) {
    authListening = true;
    supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.access_token) {
        log('access token', event === 'TOKEN_REFRESHED' ? 'refreshed' : 'set', '→ updating channels');
        authReady = supabase.realtime.setAuth(session.access_token).then(() => true);
      } else if (event === 'SIGNED_OUT') {
        authReady = null;
        topics.forEach((t, name) => dropChannel(name, t, 'down'));
      }
    });
  }

  if (!authReady) {
    authReady = supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return false;
      await supabase.realtime.setAuth(token);
      return true;
    }).catch(() => false);
  }
  return authReady;
}

// ── Channels ─────────────────────────────────────────────────────────────────

function dropChannel(name: string, t: Topic, status: RealtimeStatus) {
  if (t.rejoinTimer) clearTimeout(t.rejoinTimer);
  t.rejoinTimer = null;
  const channel = t.channel;
  t.channel = null;
  if (channel) void createClient().removeChannel(channel);
  setStatus(name, t, status);
}

function join(name: string, t: Topic) {
  if (t.channel) return;
  setStatus(name, t, 'connecting');

  void ensureAuth().then((ok) => {
    // Left, hidden or already joined while waiting for the token
    if (topics.get(name) !== t || t.channel || hiddenLeft) return;
    if (!ok) {
      setStatus(name, t, 'down');
      return;
    }

    const channel = createClient().channel(name, { config: { private: true } });
    t.channel = channel;
    channel.on('broadcast', { event: '*' }, (message) => {
      const signal = { event: message.event as string, payload: (message.payload ?? {}) as Record<string, unknown> };
      t.signals.forEach((listener) => listener(signal));
    });
    channel.subscribe((state, err) => {
      if (t.channel !== channel) return; // an old channel we already dropped
      if (err) log(name, state, err.message);
      if (state === 'SUBSCRIBED') {
        setStatus(name, t, 'live');
      } else {
        setStatus(name, t, 'down');
        if (state === 'CLOSED' && t.signals.size > 0 && !t.rejoinTimer) {
          // Closed from the server side: start over with a fresh channel
          t.rejoinTimer = setTimeout(() => {
            t.rejoinTimer = null;
            if (topics.get(name) !== t || hiddenLeft) return;
            dropChannel(name, t, 'down');
            join(name, t);
          }, REJOIN_AFTER_CLOSE_MS);
        }
        // CHANNEL_ERROR / TIMED_OUT: supabase-js keeps retrying the join
      }
    });
  });
}

/**
 * Listen on a topic. `onStatus` is called now and on every change. Returns a
 * function that stops listening; the channel is left once nobody listens.
 */
export function listen(name: string, onSignal: SignalListener, onStatus: StatusListener): () => void {
  let t = topics.get(name);
  if (!t) {
    t = { channel: null, status: 'connecting', signals: new Set(), statuses: new Set(), leaveTimer: null, rejoinTimer: null };
    topics.set(name, t);
    initVisibility();
    if (!hiddenLeft) join(name, t);
    debugListeners.forEach((listener) => listener());
  }
  const topic = t;
  if (topic.leaveTimer) {
    clearTimeout(topic.leaveTimer);
    topic.leaveTimer = null;
  }
  topic.signals.add(onSignal);
  topic.statuses.add(onStatus);
  onStatus(topic.status);

  return () => {
    topic.signals.delete(onSignal);
    topic.statuses.delete(onStatus);
    if (topic.signals.size > 0 || topic.leaveTimer) return;
    topic.leaveTimer = setTimeout(() => {
      topic.leaveTimer = null;
      if (topic.signals.size > 0) return;
      topics.delete(name);
      dropChannel(name, topic, 'down');
      debugListeners.forEach((listener) => listener());
    }, LEAVE_DELAY_MS);
  };
}

// ── Hidden tabs ──────────────────────────────────────────────────────────────

let visibilityReady = false;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

function initVisibility() {
  if (visibilityReady || typeof document === 'undefined') return;
  visibilityReady = true;
  subscribeActivity((next) => {
    if (next === 'hidden') {
      if (hiddenTimer || hiddenLeft) return;
      hiddenTimer = setTimeout(() => {
        hiddenTimer = null;
        hiddenLeft = true;
        log('tab hidden for a minute → leaving channels');
        topics.forEach((t, name) => dropChannel(name, t, 'down'));
      }, HIDDEN_LEAVE_AFTER_MS);
      return;
    }
    if (hiddenTimer) {
      clearTimeout(hiddenTimer);
      hiddenTimer = null;
    }
    if (hiddenLeft) {
      hiddenLeft = false;
      log('tab visible again → rejoining channels');
      topics.forEach((t, name) => join(name, t));
    }
  });
}
