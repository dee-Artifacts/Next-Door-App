"use client";

import { useEffect, useState } from "react";
import {
  getRealtimeSnapshot,
  isRealtimeDebug,
  subscribeRealtimeDebug,
  type RealtimeStatus,
} from "@/src/lib/realtime";

const COLORS: Record<RealtimeStatus, string> = {
  live: "#16a34a",
  connecting: "#d97706",
  resuming: "#d97706",
  down: "#dc2626",
};

/**
 * Testing aid: each Realtime topic and its state, bottom left. Shown in
 * development, or in production after
 *   localStorage.setItem('nd-debug-realtime', '1')  (then reload)
 */
export default function RealtimeDebugBadge() {
  const [enabled, setEnabled] = useState(false);
  const [topics, setTopics] = useState<Array<[string, RealtimeStatus]>>([]);

  useEffect(() => {
    if (!isRealtimeDebug()) return;
    setEnabled(true);
    setTopics(getRealtimeSnapshot());
    return subscribeRealtimeDebug(() => setTopics(getRealtimeSnapshot()));
  }, []);

  if (!enabled || topics.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed", left: 8, bottom: 8, zIndex: 9999, pointerEvents: "none",
        background: "rgba(15,23,42,0.85)", color: "#fff", borderRadius: 8,
        padding: "4px 8px", font: "11px/1.5 ui-monospace, monospace",
      }}
    >
      {topics.map(([name, status]) => (
        <div key={name}>
          <span style={{ color: COLORS[status] }}>●</span> {name}: {status}
        </div>
      ))}
    </div>
  );
}
