"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IcPlus, IcAlert } from "./Icons";
import { appPath } from "@/lib/base-path";

const EMPTY = { name: "", age: "", sex: "", phone: "", guardianName: "" };

/**
 * Register a patient.
 *
 *   mode "consult" (doctor): create the patient and open the consultation.
 *   mode "queue" (front desk): create the patient and put them on today's
 *   list. The form stays open and clears itself, ready for the next person.
 */
export default function NewPatient({
  mode = "consult",
  onQueued,
}: {
  mode?: "consult" | "queue";
  onQueued?: (message: string) => void;
}) {
  const queue = mode === "queue";
  const router = useRouter();
  const [open, setOpen] = useState(queue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const minor = form.age !== "" && Number(form.age) < 18;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(appPath("/api/patients"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, queue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create patient");
      if (queue) {
        onQueued?.(`${data.patient.name} registered and added to today's list as token ${data.queue.token}.`);
        setForm(EMPTY);
        setBusy(false);
        return;
      }
      router.push(`/consult/${data.consultId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 18 }}>
        <button onClick={() => setOpen(true)}>
          <IcPlus size={16} /> New patient &amp; consultation
        </button>
      </div>
    );
  }

  const id = (k: string) => `np-${mode}-${k}`;

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">{queue ? "Register a new patient" : "New patient"}</span>
        {!queue && <button className="quiet small" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
      <form onSubmit={submit} className="card-body">
        {queue && (
          <p className="muted" style={{ marginTop: 0 }}>
            Search first. A returning patient is already on file, and a second record splits their history.
          </p>
        )}
        <div className="grid">
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label htmlFor={id("name")}>Patient name</label>
            <input id={id("name")} value={form.name} onChange={set("name")} autoFocus={!queue} required placeholder="Full name" />
          </div>
          <div className="field">
            <label htmlFor={id("age")}>Age</label>
            <input id={id("age")} value={form.age} onChange={set("age")} inputMode="numeric" placeholder="—" />
          </div>
          <div className="field">
            <label htmlFor={id("sex")}>Sex</label>
            <select id={id("sex")} value={form.sex} onChange={set("sex")}>
              <option value="">—</option>
              <option>F</option>
              <option>M</option>
              <option>Other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={id("phone")}>Phone</label>
            <input id={id("phone")} value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="Optional" />
          </div>
        </div>

        {minor && (
          <div className="field">
            <label htmlFor={id("guardian")}>Guardian name — required under 18</label>
            <input id={id("guardian")} value={form.guardianName} onChange={set("guardianName")} required />
            <p className="muted" style={{ marginTop: 5 }}>
              A patient under 18 needs verifiable guardian consent. Note what identification you saw.
            </p>
          </div>
        )}

        {error && (
          <div className="note err" role="alert">
            <IcAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="btnrow" style={{ marginTop: 6 }}>
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : queue ? "Register and add to today's list" : "Create & start"}
          </button>
        </div>
      </form>
    </div>
  );
}
