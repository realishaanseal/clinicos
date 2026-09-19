"use client";

import { useState } from "react";
import { IcAlert } from "./Icons";
import { appPath } from "@/lib/base-path";

/**
 * clinic is the clinic being signed in to, by its address, when the page
 * already knows it. When it does not (online, with more than one clinic and
 * nothing remembered in this browser), the form asks for it.
 */
export default function LoginForm({ next, clinic }: { next: string | null; clinic: string | null }) {
  const [clinicId, setClinicId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(appPath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinic: clinic ?? clinicId, username, password, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not sign in. Try again.");
      // A full navigation, not router.push: the layout has to render again with
      // the signed-in shell around the page.
      window.location.assign(appPath(data.redirect || "/"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {clinic === null && (
        <div className="field">
          <label htmlFor="clinic">Clinic ID</label>
          <input
            id="clinic"
            name="clinic"
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            autoComplete="organization"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
          <p className="hint">The last part of your clinic&apos;s ClinicOS address, like <span className="mono">sharma-clinic</span>.</p>
        </div>
      )}
      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={clinic !== null}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      {error && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className="wide" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
