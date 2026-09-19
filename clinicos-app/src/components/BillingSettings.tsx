"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appPath } from "@/lib/base-path";
import { paiseToInput } from "@/lib/money";
import { DEFAULT_RECALL_MESSAGE, MAX_RECALL_MESSAGE } from "@/lib/recall";
import { IcAlert, IcCheck } from "./Icons";

/**
 * Clinic admin: the consultation fee that starts every new bill (#12), and the
 * words of the follow-up reminder sent on WhatsApp (#10).
 */
export default function BillingSettings({ feePaise, recallMessage }: { feePaise: number | null; recallMessage: string }) {
  const router = useRouter();
  const [fee, setFee] = useState(feePaise ? paiseToInput(feePaise) : "");
  const [message, setMessage] = useState(recallMessage || DEFAULT_RECALL_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch(appPath("/api/admin/billing"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The default is stored as nothing, so a better default in a later
        // version of ClinicOS reaches clinics that never changed it.
        body: JSON.stringify({ fee, recallMessage: message.trim() === DEFAULT_RECALL_MESSAGE ? "" : message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      setNote("Saved.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">Bills and follow-ups</span>
      </div>
      <div className="card-body">
        {error && (
          <div className="note err" role="alert">
            <IcAlert size={16} />
            <span>{error}</span>
          </div>
        )}
        {note && (
          <div className="note ok" role="status">
            <IcCheck size={16} />
            <span>{note}</span>
          </div>
        )}
        <div className="field">
          <label htmlFor="clinic-fee">Consultation fee (₹)</label>
          <input
            id="clinic-fee"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 300"
            style={{ maxWidth: 180 }}
          />
          <p className="hint">Every new bill starts with a “Consultation” line at this amount. The desk can change it.</p>
        </div>
        <div className="field">
          <label htmlFor="recall-message">Follow-up reminder on WhatsApp</label>
          <textarea
            id="recall-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={MAX_RECALL_MESSAGE}
          />
          <p className="hint">
            {"{name}"}, {"{clinic}"}, {"{doctor}"} and {"{date}"} are filled in for each patient. There is deliberately no way
            to add why they were seen: the first line shows on a phone&apos;s lock screen.{" "}
            {message.trim() !== DEFAULT_RECALL_MESSAGE && (
              <button type="button" className="quiet small" onClick={() => setMessage(DEFAULT_RECALL_MESSAGE)} disabled={busy}>
                Use the default
              </button>
            )}
          </p>
        </div>
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
