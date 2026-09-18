"use client";

import { useState } from "react";
import type { FavouriteView } from "@/lib/db";
import { applyPlan, planHasContent, planOf, type ClinicalNote, type Plan } from "@/lib/types";
import { appPath } from "@/lib/base-path";
import { IcCheck, IcPlus, IcTrash } from "./Icons";

/** "2 medicines, 1 test and advice" */
function inWords(parts: string[]): string {
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function summary(p: Plan): string {
  const bits = [
    p.diagnosis,
    p.medications.map((m) => m.name).join(", "),
    p.investigations.join(", "),
  ].filter(Boolean);
  return bits.join(" · ") || [p.advice, p.followUp].filter(Boolean).join(" · ");
}

/**
 * The doctor's own saved prescriptions (backlog #15, #16). Choosing one fills
 * the note without overwriting anything already in it; saving keeps only the
 * plan — diagnosis, medicines, tests, advice, follow-up — never the patient's
 * complaint or findings. ClinicOS ships no favourites of its own: a
 * pre-written treatment would be clinical advice.
 */
export default function Favourites({
  initial,
  note,
  setNote,
}: {
  initial: FavouriteView[];
  note: ClinicalNote;
  setNote: (n: ClinicalNote) => void;
}) {
  const [favs, setFavs] = useState(initial);
  const [mode, setMode] = useState<"idle" | "saving" | "managing">("idle");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const canSave = planHasContent(planOf(note));

  function use(id: string) {
    const f = favs.find((x) => x.id === id);
    if (!f) return;
    const { note: next, added } = applyPlan(note, f.plan);
    setNote(next);
    setErr("");
    setMsg(
      added.length
        ? `Added ${inWords(added)} from “${f.name}”. Check each line before signing.`
        : `Everything in “${f.name}” is already in the note.`
    );
    // Only the ordering depends on this, so a failure is not worth a message.
    fetch(appPath(`/api/favourites/${id}/use`), { method: "POST" }).catch(() => {});
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(appPath("/api/favourites"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, plan: note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save the favourite.");
      const saved = data.favourite as FavouriteView;
      setFavs((list) => [...list.filter((x) => x.id !== saved.id), saved]);
      setMsg(data.replaced ? `Replaced your favourite “${saved.name}”.` : `Saved as “${saved.name}”.`);
      setName("");
      setMode("idle");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(appPath(`/api/favourites/${id}`), { method: "DELETE" });
      // Already gone elsewhere is the outcome that was wanted.
      if (!res.ok && res.status !== 404) throw new Error("Couldn't delete the favourite.");
      setFavs((list) => list.filter((x) => x.id !== id));
      setConfirmId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="favs">
      <div className="favbar">
        <select
          aria-label="Use a favourite"
          value=""
          disabled={!favs.length}
          onChange={(e) => e.target.value && use(e.target.value)}
        >
          <option value="">{favs.length ? "Use a favourite…" : "No favourites yet"}</option>
          {favs.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button
          className="ghost small"
          type="button"
          disabled={!canSave}
          title={canSave ? undefined : "Write a diagnosis, a medicine, a test or advice first"}
          onClick={() => { setMode(mode === "saving" ? "idle" : "saving"); setMsg(""); setErr(""); }}
        >
          <IcPlus size={14} /> Save as favourite
        </button>
        {favs.length > 0 && (
          <button className="quiet small" type="button" onClick={() => { setMode(mode === "managing" ? "idle" : "managing"); setConfirmId(null); }}>
            {mode === "managing" ? "Done" : "Manage"}
          </button>
        )}
      </div>

      {mode === "saving" && (
        <form className="favform" onSubmit={save}>
          <label htmlFor="fav-name">Name this favourite</label>
          <div className="btnrow">
            <input
              id="fav-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Viral fever — adult"
              maxLength={80}
              autoFocus
              style={{ flex: "1 1 220px", width: "auto" }}
            />
            <button className="small" type="submit" disabled={busy || !name.trim()}>
              <IcCheck size={14} /> Save
            </button>
            <button className="quiet small" type="button" onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Saves the diagnosis, medicines, tests, advice and follow-up — not this patient&apos;s complaint
            or findings. The same name replaces the one you saved before.
          </p>
        </form>
      )}

      {mode === "managing" && (
        <ul className="favlist">
          {favs.map((f) => (
            <li key={f.id}>
              <div>
                <strong>{f.name}</strong>
                <div className="muted">{summary(f.plan)}</div>
              </div>
              {confirmId === f.id ? (
                <span className="btnrow">
                  <button className="ghost small danger-btn" type="button" disabled={busy} onClick={() => remove(f.id)}>
                    Delete “{f.name}”
                  </button>
                  <button className="quiet small" type="button" onClick={() => setConfirmId(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button className="iconbtn" type="button" title={`Delete “${f.name}”`} onClick={() => setConfirmId(f.id)}>
                  <IcTrash size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {err && <p className="favmsg err" role="alert">{err}</p>}
      {msg && !err && <p className="favmsg" role="status">{msg}</p>}
    </div>
  );
}
