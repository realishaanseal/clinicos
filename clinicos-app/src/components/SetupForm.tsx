"use client";

import { useState } from "react";
import { IcAlert } from "./Icons";
import { PASSWORD_MIN, USERNAME_RULE } from "@/lib/users";
import { appPath } from "@/lib/base-path";
import { ClinicTermsList } from "./ClinicTerms";

type Defaults = { clinicName: string; name: string; qualification: string; regNo: string };

export default function SetupForm({
  defaults,
  needsCode,
  clinic,
}: {
  defaults: Defaults;
  needsCode: boolean;
  /** The clinic being set up, by its address. Null on a clinic computer. */
  clinic: string | null;
}) {
  const [form, setForm] = useState({
    setupCode: "",
    clinicName: defaults.clinicName,
    name: defaults.name,
    username: "",
    password: "",
    confirm: "",
    isDoctor: true,
    qualification: defaults.qualification,
    regNo: defaults.regNo,
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(appPath("/api/setup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, clinic, acceptTerms }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Setup didn't complete. Try again.");
      window.location.assign(appPath(data.redirect || "/"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {needsCode && (
        <div className="field">
          <label htmlFor="setupCode">Setup code</label>
          <input
            id="setupCode"
            value={form.setupCode}
            onChange={set("setupCode")}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
          />
          <p className="hint">The code you were given for setting up this clinic. It only works once.</p>
        </div>
      )}

      <div className="field">
        <label htmlFor="clinicName">Clinic name</label>
        <input id="clinicName" value={form.clinicName} onChange={set("clinicName")} required autoFocus={!needsCode} />
        <p className="hint">Printed at the top of every prescription. You can change it later.</p>
      </div>

      <fieldset className="choice">
        <legend>Do you see patients here?</legend>
        <label>
          <input
            type="radio"
            name="isDoctor"
            checked={form.isDoctor}
            onChange={() => setForm({ ...form, isDoctor: true })}
          />
          <span>
            Yes, I&apos;m a doctor here
            <small>You get consultations and prescriptions, and you manage the clinic.</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="isDoctor"
            checked={!form.isDoctor}
            onChange={() => setForm({ ...form, isDoctor: false })}
          />
          <span>
            No, I run the clinic
            <small>You manage people, clinic details and backups, and cannot open clinical notes.</small>
          </span>
        </label>
      </fieldset>

      <div className="field">
        <label htmlFor="name">Your full name</label>
        <input id="name" value={form.name} onChange={set("name")} autoComplete="name" required />
      </div>

      {form.isDoctor && (
        <div className="grid">
          <div className="field">
            <label htmlFor="qualification">Qualification</label>
            <input id="qualification" value={form.qualification} onChange={set("qualification")} placeholder="MBBS" />
          </div>
          <div className="field">
            <label htmlFor="regNo">Registration number</label>
            <input id="regNo" value={form.regNo} onChange={set("regNo")} />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={form.username}
          onChange={set("username")}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-describedby="username-hint"
        />
        <p className="hint" id="username-hint">{USERNAME_RULE[0].toUpperCase() + USERNAME_RULE.slice(1)}.</p>
      </div>

      <div className="grid">
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            required
            aria-describedby="password-hint"
          />
          <p className="hint" id="password-hint">At least {PASSWORD_MIN} characters.</p>
        </div>
        <div className="field">
          <label htmlFor="confirm">Password again</label>
          <input
            id="confirm"
            type="password"
            value={form.confirm}
            onChange={set("confirm")}
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      {/* Once, for the whole clinic: this is what lets ClinicOS record, instead
          of a consent screen before every visit (lib/terms.ts). */}
      <div className="terms-box">
        <div className="terms-hd">ClinicOS terms for this clinic</div>
        <ClinicTermsList />
        <label className="check">
          <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} required /> I accept
          these terms for the clinic, and we will tell every patient before recording.
        </label>
      </div>

      {error && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className="wide" disabled={busy || !acceptTerms}>
        {busy ? "Setting up…" : "Create account and start"}
      </button>
    </form>
  );
}
