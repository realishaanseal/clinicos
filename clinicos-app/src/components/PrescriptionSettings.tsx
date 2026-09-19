"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcAlert, IcCheck } from "./Icons";
import { appPath } from "@/lib/base-path";
import { CARD_LANGUAGES, type CardLanguage } from "@/lib/rx-card";

/**
 * How the clinic's prescriptions print: its logo on the letterhead (#25), and
 * a medicine timing card in the patient's language (#9).
 */
export default function PrescriptionSettings({ logo, cardLanguage }: { logo: string; cardLanguage: CardLanguage | null }) {
  const router = useRouter();
  const [lang, setLang] = useState<string>(cardLanguage ?? "off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function send(url: string, init: RequestInit, done: string) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      setNote(done);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("logo", file);
    void send(appPath("/api/admin/prescription/logo"), { method: "POST", body: form }, "Logo saved. It prints on every prescription from now on.");
  }

  function chooseLang(v: string) {
    setLang(v);
    void send(
      appPath("/api/admin/prescription"),
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardLanguage: v }) },
      v === "off" ? "No timing card on prescriptions." : "The timing card prints under the medicines from now on."
    );
  }

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">Prescriptions</span>
        <span className="muted">how they print</span>
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
          <label htmlFor="rx-logo">Clinic logo</label>
          <div className="btnrow">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing to optimise
              <img src={logo} alt="The clinic's logo" style={{ width: 46, height: 46, objectFit: "contain", borderRadius: 8, border: "1px solid var(--line)" }} />
            ) : (
              <span className="muted">None: the ClinicOS mark prints instead.</span>
            )}
            <label className="ghost-file">
              <input id="rx-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={busy} />
              {logo ? "Change…" : "Upload…"}
            </label>
            {logo && (
              <button
                type="button"
                className="quiet small"
                disabled={busy}
                onClick={() => send(appPath("/api/admin/prescription/logo"), { method: "DELETE" }, "Logo removed.")}
              >
                Remove
              </button>
            )}
          </div>
          <p className="hint">PNG, JPEG or WebP, under 100 KB. A square logo prints best.</p>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="rx-card">Medicine timing card</label>
          <select id="rx-card" value={lang} onChange={(e) => chooseLang(e.target.value)} disabled={busy} style={{ maxWidth: 320 }}>
            <option value="off">None</option>
            {Object.entries(CARD_LANGUAGES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <p className="hint">
            Under the medicines: morning, afternoon and night, before or after food, and for how long, in the patient&apos;s
            language with pictures. It only re-reads what the doctor wrote — anything it cannot read for certain, such as
            &ldquo;OD&rdquo; with no time of day, prints exactly as written.
          </p>
        </div>
      </div>
    </div>
  );
}
