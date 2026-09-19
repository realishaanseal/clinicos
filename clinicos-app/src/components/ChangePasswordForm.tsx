"use client";

import { useState } from "react";
import { IcAlert } from "./Icons";
import { PASSWORD_MIN } from "@/lib/users";
import { appPath } from "@/lib/base-path";

/** endpoint is for the platform console, which has its own accounts; a
 *  clinic's screens leave it out. Already prefixed with appPath(). */
export default function ChangePasswordForm({ endpoint }: { endpoint?: string } = {}) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.next !== form.confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(endpoint ?? appPath("/api/auth/password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: form.current, next: form.next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The password wasn't changed. Try again.");
      window.location.assign(appPath(data.redirect || "/"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="current">Current password</label>
        <input
          id="current"
          type="password"
          value={form.current}
          onChange={set("current")}
          autoComplete="current-password"
          required
          autoFocus
        />
      </div>
      <div className="grid">
        <div className="field">
          <label htmlFor="next">New password</label>
          <input
            id="next"
            type="password"
            value={form.next}
            onChange={set("next")}
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            required
            aria-describedby="next-hint"
          />
          <p className="hint" id="next-hint">At least {PASSWORD_MIN} characters.</p>
        </div>
        <div className="field">
          <label htmlFor="confirm">New password again</label>
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

      {error && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="btnrow">
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
