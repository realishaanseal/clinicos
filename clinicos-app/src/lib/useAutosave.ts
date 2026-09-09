"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClinicalNote } from "./types";

export type SaveState = "idle" | "saving" | "saved" | "error";

const LS_KEY = (id: string) => `clinicos:working:${id}`;

/**
 * Autosave of work in progress.
 *
 * Two layers, deliberately:
 *   1. the server (SQLite on this same machine) — survives the browser dying
 *   2. localStorage — survives the *server* dying while the browser lives
 *
 * Neither is clever. Between them there is no single process whose death loses
 * the doctor's typing.
 */
export function useAutosave(consultId: string, enabled: boolean) {
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ transcript?: string; note?: ClinicalNote } | null>(null);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    if (!enabled || !pending.current) return;
    const payload = pending.current;
    pending.current = null;
    setState("saving");
    try {
      const res = await fetch(`/api/consults/${consultId}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed");
      dirty.current = false;
      setState("saved");
      setSavedAt(new Date());
    } catch {
      // Server unreachable. localStorage already holds it — say so honestly
      // rather than showing a reassuring tick.
      setState("error");
    }
  }, [consultId, enabled]);

  const queue = useCallback(
    (data: { transcript?: string; note?: ClinicalNote }) => {
      if (!enabled) return;
      pending.current = { ...pending.current, ...data };
      dirty.current = true;

      // Local mirror is synchronous and immediate — no debounce.
      try {
        localStorage.setItem(
          LS_KEY(consultId),
          JSON.stringify({ ...pending.current, at: new Date().toISOString() })
        );
      } catch {
        /* quota or private mode — the server copy still applies */
      }

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 1200);
    },
    [consultId, enabled, flush]
  );

  // Last-gasp save when the tab is being hidden or closed. visibilitychange is
  // the only event that reliably fires on mobile and on force-quit.
  useEffect(() => {
    const onHide = () => {
      if (!dirty.current || !pending.current) return;
      try {
        navigator.sendBeacon?.(
          `/api/consults/${consultId}/draft?beacon=1`,
          new Blob([JSON.stringify(pending.current)], { type: "application/json" })
        );
      } catch {
        /* nothing more we can do */
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [consultId]);

  const clearLocal = useCallback(() => {
    try {
      localStorage.removeItem(LS_KEY(consultId));
    } catch {
      /* ignore */
    }
  }, [consultId]);

  return { queue, flush, state, savedAt, clearLocal, isDirty: () => dirty.current };
}

/** Read the local mirror, if this browser has newer work than the server sent. */
export function readLocalMirror(consultId: string): {
  transcript?: string;
  note?: ClinicalNote;
  at?: string;
} | null {
  try {
    const raw = localStorage.getItem(LS_KEY(consultId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
