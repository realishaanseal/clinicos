"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcAlert, IcCheck } from "./Icons";
import { appPath } from "@/lib/base-path";

type ClinicDraft = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  localSync: boolean;
  domain: string;
  paidUntil: string;
  notes: string;
  status: "active" | "suspended";
};

/**
 * What a clinic has, changed by Varaxis: its plan and what the plan switches
 * on, its address, and whether it is paused. Pausing keeps every record and
 * the clinic's way to export them; it is undone by switching back on.
 */
export default function ClinicEditForm({
  clinic,
  plans,
  awaitingSetup,
  base,
}: {
  clinic: ClinicDraft;
  plans: Record<string, string>;
  awaitingSetup: boolean;
  base: string;
}) {
  const router = useRouter();
  const [d, setD] = useState(clinic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [confirmPause, setConfirmPause] = useState(false);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { id, status, ...rest } = d;
    void status;
    if (await send(appPath(`/api/platform/clinics/${id}`), "PATCH", rest)) {
      setSaved(true);
      router.refresh();
    }
  }

  async function setStatus(status: "active" | "suspended") {
    if (await send(appPath(`/api/platform/clinics/${d.id}`), "PATCH", { status })) {
      setD({ ...d, status });
      setConfirmPause(false);
      router.refresh();
    }
  }

  async function newCode() {
    const data = await send(appPath(`/api/platform/clinics/${d.id}/setup-code`), "POST");
    if (data) setCode(data.setupCode);
  }

  return (
    <>
      {error && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      <form className="card" onSubmit={save}>
        <div className="card-head" style={{ padding: 0, border: "none", marginBottom: 14 }}>
          <span className="title">What this clinic has</span>
        </div>
        <div className="grid">
          <div className="field">
            <label htmlFor="ce-name">Clinic name</label>
            <input id="ce-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
            <p className="hint">For Varaxis. The clinic sets the name printed on its prescriptions itself.</p>
          </div>
          <div className="field">
            <label htmlFor="ce-slug">Clinic ID</label>
            <input
              id="ce-slug"
              value={d.slug}
              onChange={(e) => setD({ ...d, slug: e.target.value.toLowerCase() })}
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            <p className="hint">Changing it changes their address, and their bookmarks stop working.</p>
          </div>
        </div>
        <div className="grid">
          <div className="field">
            <label htmlFor="ce-plan">Plan</label>
            <select id="ce-plan" value={d.plan} onChange={(e) => setD({ ...d, plan: e.target.value })}>
              {Object.entries(plans).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ce-paid">Paid until</label>
            <input id="ce-paid" type="date" value={d.paidUntil} onChange={(e) => setD({ ...d, paidUntil: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={d.localSync} onChange={(e) => setD({ ...d, localSync: e.target.checked })} />{" "}
            Clinic computer sync — a ClinicOS install on the clinic&apos;s own computer keeps its records in step with this one
          </label>
        </div>
        <div className="field">
          <label htmlFor="ce-domain">The clinic&apos;s own web address (optional)</label>
          <input
            id="ce-domain"
            value={d.domain}
            onChange={(e) => setD({ ...d, domain: e.target.value })}
            placeholder="records.clinicname.in"
            autoCapitalize="none"
            spellCheck={false}
          />
          <p className="hint">Only once that address points at ClinicOS. Its sign-in page then opens this clinic by itself.</p>
        </div>
        <div className="field">
          <label htmlFor="ce-notes">Notes for Varaxis</label>
          <input id="ce-notes" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
          <p className="hint">Seen only in this console. Never put a patient&apos;s details here.</p>
        </div>
        {saved && (
          <div className="note ok" role="status">
            <IcCheck size={16} />
            <span>Saved. The change is in the clinic&apos;s own activity log too.</span>
          </div>
        )}
        <div className="btnrow">
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {awaitingSetup && (
        <div className="card">
          <div className="card-head" style={{ padding: 0, border: "none", marginBottom: 10 }}>
            <span className="title">Setup code</span>
          </div>
          {code ? (
            <p style={{ margin: 0 }}>
              New code: <span className="secret">{code}</span> — shown only this once. The old one no longer works.
              Send it with the address <span className="mono">{`${base}/c/${d.slug}`}</span>.
            </p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                Nobody has set this clinic up yet. If its code was lost, make a new one; the old one stops working.
              </p>
              <button type="button" className="ghost" onClick={newCode} disabled={busy}>
                Make a new setup code
              </button>
            </>
          )}
        </div>
      )}

      <div className="danger">
        <div className="danger-hd">{d.status === "suspended" ? "Paused" : "Pause this clinic"}</div>
        <div className="danger-bd">
          {d.status === "suspended" ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                Its doctors and front desk can&apos;t open consultations or the day&apos;s list. Whoever manages the
                clinic can still sign in and export everything.
              </p>
              <button type="button" onClick={() => setStatus("active")} disabled={busy}>
                Switch back on
              </button>
            </>
          ) : confirmPause ? (
            <>
              <p style={{ marginTop: 0 }}>
                Pause {d.name}? Consultations stop at once, in the middle of a clinic day if it is one. Nothing is
                deleted, and switching back on restores everything.
              </p>
              <div className="btnrow">
                <button type="button" className="ghost danger-btn" onClick={() => setStatus("suspended")} disabled={busy}>
                  Yes, pause it
                </button>
                <button type="button" className="quiet" onClick={() => setConfirmPause(false)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                For a subscription that has lapsed. Records are kept, and the clinic can still export them.
              </p>
              <button type="button" className="ghost danger-btn" onClick={() => setConfirmPause(true)} disabled={busy}>
                Pause…
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
