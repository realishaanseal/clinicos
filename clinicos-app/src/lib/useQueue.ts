"use client";

import { useCallback, useEffect, useState } from "react";
import type { QueueRow } from "./db";

const POLL_MS = 5000;

/**
 * Today's list, kept fresh by polling.
 *
 * Polling rather than a live connection: it is five lines, it works through
 * whatever the clinic Wi-Fi does, and every five seconds is fast enough for a
 * waiting room. It stops while the tab is hidden and catches up on return.
 */
export function useQueue(initial: QueueRow[]) {
  const [rows, setRows] = useState<QueueRow[]>(initial);
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/queue", { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) throw new Error("queue unavailable");
      const data = await res.json();
      setRows(data.queue);
      setStale(false);
    } catch {
      // Keep showing the last list, but say it may be out of date.
      setStale(true);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        if (!timer) timer = setInterval(refresh, POLL_MS);
      } else {
        stop();
      }
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { rows, refresh, stale };
}

/** "just now", "12 min", "1 h 5 min" since an ISO timestamp. */
export function elapsed(iso: string | null): string {
  if (!iso) return "";
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
