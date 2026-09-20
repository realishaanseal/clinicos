"use client";

import { useState } from "react";
import { IcPrint } from "./Icons";
import { appPath } from "@/lib/base-path";
import type { Lang } from "@/lib/terms";
import { wordsFor } from "@/lib/portal-words";

/** Print, or take a prescription out of the patient's own list. */
export default function PortalVisitActions({ id, lang }: { id: string; lang: Lang }) {
  const w = wordsFor(lang);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function hide() {
    setBusy(true);
    await fetch(appPath(`/api/portal/visits/${id}/hide`), { method: "POST" });
    window.location.assign(appPath("/p"));
  }

  return (
    <div className="btnrow noprint" style={{ marginBottom: 18 }} lang={lang}>
      <button type="button" onClick={() => window.print()}>
        <IcPrint size={16} /> {w.print}
      </button>
      {confirm ? (
        <>
          <span className="muted">{w.removeConfirm}</span>
          <button type="button" className="ghost danger-btn" onClick={hide} disabled={busy}>
            {w.remove}
          </button>
          <button type="button" className="quiet" onClick={() => setConfirm(false)} disabled={busy}>
            {w.cancel}
          </button>
        </>
      ) : (
        <button type="button" className="ghost" onClick={() => setConfirm(true)}>
          {w.removeAsk}
        </button>
      )}
    </div>
  );
}
