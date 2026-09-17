"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcAlert, IcCheck } from "./Icons";
import { appPath } from "@/lib/base-path";

type Clinic = { name: string; address: string; phone: string };

export default function ClinicSettingsForm({ initial }: { initial: Clinic }) {
  const router = useRouter();
  const [form, setForm] = useState<Clinic>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const set = (k: keyof Clinic) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setForm({ ...form, [k]: e.target.value });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(appPath("/api/admin/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save. Try again.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="clinic-name">Clinic name</label>
        <input id="clinic-name" value={form.name} onChange={set("name")} required />
      </div>
      <div className="field">
        <label htmlFor="clinic-address">Address</label>
        <input id="clinic-address" value={form.address} onChange={set("address")} autoComplete="street-address" />
      </div>
      <div className="field">
        <label htmlFor="clinic-phone">Phone</label>
        <input id="clinic-phone" value={form.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" />
      </div>
      <p className="hint" style={{ marginTop: -4, marginBottom: 14 }}>
        Doctor names, qualifications and registration numbers come from each doctor&apos;s account under People.
      </p>

      {form.name.trim() === "Demo Clinic" && (
        <div className="note info">
          <IcAlert size={17} />
          <span>This is still the placeholder name, and it prints on every prescription.</span>
        </div>
      )}
      {error && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}
      {saved && (
        <div className="note ok" role="status">
          <IcCheck size={16} />
          <span>Saved. Prescriptions use these details from now on.</span>
        </div>
      )}

      <div className="btnrow">
        <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save clinic details"}</button>
      </div>
    </form>
  );
}
