"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appPath } from "@/lib/base-path";
import { CLINIC_TERMS, type ClinicTerms } from "@/lib/terms";
import { fmtDate } from "@/lib/time";
import { IcAlert, IcCheck, IcShield } from "./Icons";

/** The terms themselves, as a short list. */
export function ClinicTermsList() {
  return (
    <ul className="terms-list">
      {CLINIC_TERMS.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/**
 * The clinic's one-time acceptance of ClinicOS's terms, which switches
 * recording on. In Clinic admin, and on the recorder of a clinic that has not
 * accepted yet. Only someone who manages the clinic may accept: it is the
 * clinic's undertaking to tell every patient and record no one who says no.
 */
export default function ClinicTermsCard({
  terms,
  inForce,
  canAccept,
  onAccepted,
  compact = false,
}: {
  terms: ClinicTerms | null;
  inForce: boolean;
  canAccept: boolean;
  onAccepted?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(appPath("/api/admin/terms"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      onAccepted?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (inForce && terms) {
    return (
      <div className={compact ? "" : "card flush"}>
        {!compact && (
          <div className="card-head">
            <span className="title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IcShield size={16} /> ClinicOS terms
            </span>
            <span className="pill signed">Accepted</span>
          </div>
        )}
        <div className={compact ? "" : "card-body"}>
          <p className="muted" style={{ marginTop: 0 }}>
            Accepted for the clinic by {terms.byName || "someone who manages it"} on{" "}
            {fmtDate(terms.at, { day: "numeric", month: "long", year: "numeric" })}. Recording is on.
          </p>
          <ClinicTermsList />
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "terms-box" : "card flush"}>
      <div className="card-head">
        <span className="title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IcShield size={16} /> {terms ? "ClinicOS terms have changed" : "Accept ClinicOS's terms to switch recording on"}
        </span>
      </div>
      <div className="card-body">
        <p className="muted" style={{ marginTop: 0 }}>
          Once, for the whole clinic. After that the doctor goes straight to recording, every visit.
        </p>
        <ClinicTermsList />
        {error && (
          <div className="note err" role="alert">
            <IcAlert size={16} />
            <span>{error}</span>
          </div>
        )}
        {canAccept ? (
          <>
            <label className="check" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} /> I accept these terms
              for the clinic, and we will tell every patient before recording.
            </label>
            <button type="button" onClick={accept} disabled={!ticked || busy} style={{ marginTop: 12 }}>
              <IcCheck size={16} /> {busy ? "Saving…" : "Accept and switch recording on"}
            </button>
          </>
        ) : (
          <p className="note info" style={{ marginBottom: 0 }}>
            <IcAlert size={16} />
            <span>Whoever manages the clinic accepts these once, in Clinic admin. Until then, write the note by hand.</span>
          </p>
        )}
      </div>
    </div>
  );
}
