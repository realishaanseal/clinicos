"use client";

import { useEffect, useState } from "react";
import { IcAlert } from "./Icons";
import { appPath } from "@/lib/base-path";
import { PATIENT_TERMS, type Lang } from "@/lib/terms";
import { errorText, wordsFor } from "@/lib/portal-words";

/**
 * Patient sign-in, in the language they chose. With a PIN, or — the first
 * time, or when the PIN is forgotten — with the code printed on a
 * prescription, choosing a new PIN and agreeing to the portal's terms once.
 * The QR code on a prescription carries the code after "#", which a browser
 * never sends to a server, and it is filled in here.
 */
export default function PortalSignIn({ lang }: { lang: Lang }) {
  const w = wordsFor(lang);
  const terms = PATIENT_TERMS[lang];
  const [withCode, setWithCode] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [agreed, setAgreed] = useState(false);
  // An account from before the portal had terms is asked once, at its next sign-in.
  const [needTerms, setNeedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const m = /code=([A-Za-z0-9-]+)/.exec(window.location.hash);
    if (m) {
      setWithCode(true);
      setCode(m[1].toUpperCase());
      // Out of the address bar, so it is not left in the phone's history.
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const showTerms = withCode || needTerms;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (withCode && pin !== pin2) {
      setError(w.errors["pins-differ"]);
      return;
    }
    if (showTerms && !agreed) {
      setError(w.errors.terms);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(withCode ? appPath("/api/portal/start") : appPath("/api/portal/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin, lang, ...(withCode ? { code } : {}), ...(showTerms ? { acceptTerms: agreed } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.needTerms) setNeedTerms(true);
        throw new Error(errorText(w, data));
      }
      window.location.assign(appPath(data.redirect || "/p"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} lang={lang}>
      <div className="field">
        <label htmlFor="pp-phone">{w.phone}</label>
        <input
          id="pp-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          autoFocus
        />
      </div>
      {withCode && (
        <div className="field">
          <label htmlFor="pp-code">{w.code}</label>
          <input
            id="pp-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7QF-2MXP-9D"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>
      )}
      <div className={withCode ? "grid" : ""}>
        <div className="field">
          <label htmlFor="pp-pin">{withCode ? w.choosePin : w.pin}</label>
          <input
            id="pp-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete={withCode ? "new-password" : "current-password"}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            required
          />
        </div>
        {withCode && (
          <div className="field">
            <label htmlFor="pp-pin2">{w.pinAgain}</label>
            <input
              id="pp-pin2"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="new-password"
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
        )}
      </div>

      {showTerms && (
        <div className="terms-box">
          <div className="terms-hd">{terms.title}</div>
          <ul className="terms-list">
            {terms.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> {terms.agree}
          </label>
        </div>
      )}

      {error && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className="wide" disabled={busy || (showTerms && !agreed)}>
        {busy ? w.opening : withCode ? w.setPin : w.open}
      </button>
      <p className="muted" style={{ marginBottom: 0, textAlign: "center" }}>
        <button
          type="button"
          className="quiet small"
          onClick={() => {
            setWithCode(!withCode);
            setError("");
          }}
        >
          {withCode ? w.havePin : w.useCode}
        </button>
      </p>
    </form>
  );
}
