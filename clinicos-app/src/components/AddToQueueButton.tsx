"use client";

import { useState } from "react";
import { appPath } from "@/lib/base-path";

/** One-tap "put this patient on today's list", for the front desk's patient list. */
export default function AddToQueueButton({ patientId, name }: { patientId: string; name: string }) {
  const [state, setState] = useState<{ busy: boolean; label: string | null; failed: boolean }>({
    busy: false,
    label: null,
    failed: false,
  });

  async function add() {
    setState({ busy: true, label: null, failed: false });
    try {
      const res = await fetch(appPath("/api/queue"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setState({
        busy: false,
        label: data.alreadyQueued ? `Already token ${data.entry.token}` : `Added · token ${data.entry.token}`,
        failed: false,
      });
    } catch {
      setState({ busy: false, label: "Couldn't add — try again", failed: true });
    }
  }

  if (state.label && !state.failed) {
    return (
      <span className="pill signed" role="status">
        {state.label}
      </span>
    );
  }

  return (
    <button type="button" className="ghost small" onClick={add} disabled={state.busy}>
      {state.busy ? "Adding…" : state.label ?? "Add to today's list"}
      <span className="visually-hidden"> {name}</span>
    </button>
  );
}
