"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcAlert, IcCheck, IcPlus } from "./Icons";
import { appPath } from "@/lib/base-path";

type Draft = { name: string; slug: string; plan: string; localSync: boolean; paidUntil: string; notes: string };
const EMPTY: Draft = { name: "", slug: "", plan: "cloud", localSync: false, paidUntil: "", notes: "" };

/** "Sharma Clinic, Krishnanagar" → "sharma-clinic-krishnanagar". A suggestion
 *  only; the operator can change it before creating. */
function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/**
 * Create a clinic. What it bought decides the plan and whether a ClinicOS
 * install on the clinic's own computer may keep in step with this one. The
 * setup code is shown once, here, and must reach the clinic with its address.
 */
export default function NewClinicForm({ base, plans }: { base: string; plans: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<{ name: string; slug: string; code: string } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(appPath("/api/platform/clinics"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      setMade({ name: data.clinic.name, slug: data.clinic.slug, code: data.setupCode });
      setDraft(EMPTY);
      setSlugTouched(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {made && (
        <div className="note ok" role="status">
          <IcCheck size={17} />
          <span>
            <strong>{made.name} is ready to set up.</strong> Send the clinic these two things, the code separately
            from the address if you can:
            <br />
            Address: <span className="secret">{`${base}/c/${made.slug}`}</span>
            <br />
            Setup code: <span className="secret">{made.code}</span>
            <br />
            The code is shown only this once and works once. If it is lost before it is used, make a new one from the
            clinic&apos;s page.{" "}
            <button type="button" className="quiet small" onClick={() => setMade(null)}>
              Done
            </button>
          </span>
        </div>
      )}

      {!open ? (
        <div className="btnrow" style={{ marginBottom: 18 }}>
          <button type="button" onClick={() => { setOpen(true); setMade(null); }}>
            <IcPlus size={16} /> New clinic
          </button>
        </div>
      ) : (
        <form className="card" onSubmit={create}>
          <div className="card-head" style={{ padding: 0, border: "none", marginBottom: 14 }}>
            <span className="title">New clinic</span>
          </div>
          <div className="grid">
            <div className="field">
              <label htmlFor="nc-name">Clinic name</label>
              <input
                id="nc-name"
                value={draft.name}
                onChange={(e) =>
                  setDraft({ ...draft, name: e.target.value, slug: slugTouched ? draft.slug : suggestSlug(e.target.value) })
                }
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="nc-slug">Clinic ID</label>
              <input
                id="nc-slug"
                value={draft.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setDraft({ ...draft, slug: e.target.value.toLowerCase() });
                }}
                autoCapitalize="none"
                spellCheck={false}
                required
              />
              <p className="hint">
                Their address: <span className="mono">{`${base}/c/${draft.slug || "…"}`}</span>
              </p>
            </div>
          </div>
          <div className="grid">
            <div className="field">
              <label htmlFor="nc-plan">Plan</label>
              <select
                id="nc-plan"
                value={draft.plan}
                onChange={(e) => setDraft({ ...draft, plan: e.target.value, localSync: e.target.value === "cloud-local" || draft.localSync })}
              >
                {Object.entries(plans).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nc-paid">Paid until (optional)</label>
              <input id="nc-paid" type="date" value={draft.paidUntil} onChange={(e) => setDraft({ ...draft, paidUntil: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.localSync}
                onChange={(e) => setDraft({ ...draft, localSync: e.target.checked })}
              />{" "}
              Clinic computer sync — a ClinicOS install on the clinic&apos;s own computer keeps its records in step with
              this one
            </label>
          </div>
          <div className="field">
            <label htmlFor="nc-notes">Notes for Varaxis (optional)</label>
            <input
              id="nc-notes"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Invoice number, contact person…"
            />
            <p className="hint">Seen only in this console. Never put a patient&apos;s details here.</p>
          </div>
          {error && (
            <div className="note err" role="alert">
              <IcAlert size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="btnrow">
            <button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create clinic"}
            </button>
            <button type="button" className="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </>
  );
}
