"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IcPlus, IcAlert } from "./Icons";

export default function NewPatient() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", age: "", sex: "", phone: "", guardianName: "" });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const minor = form.age !== "" && Number(form.age) < 18;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create patient");
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

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">New patient</span>
        <button className="quiet small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <form onSubmit={submit} className="card-body">
        <div className="grid">
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label>Patient name</label>
            <input value={form.name} onChange={set("name")} autoFocus required placeholder="Full name" />
          </div>
          <div className="field">
            <label>Age</label>
            <input value={form.age} onChange={set("age")} inputMode="numeric" placeholder="—" />
          </div>
          <div className="field">
            <label>Sex</label>
            <select value={form.sex} onChange={set("sex")}>
              <option value="">—</option>
              <option>F</option>
              <option>M</option>
              <option>Other</option>
            </select>
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="Optional" />
          </div>
        </div>

        {minor && (
          <div className="field">
            <label>Guardian name — required under 18</label>
            <input value={form.guardianName} onChange={set("guardianName")} required />
            <p className="muted" style={{ marginTop: 5 }}>
              A patient under 18 needs verifiable guardian consent. Note what identification you saw.
            </p>
          </div>
        )}

        {error && (
          <div className="note err">
            <IcAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="btnrow" style={{ marginTop: 6 }}>
          <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create & start"}</button>
        </div>
      </form>
    </div>
  );
}
