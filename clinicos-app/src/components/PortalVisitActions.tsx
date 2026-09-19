"use client";

import { useState } from "react";
import { IcPrint } from "./Icons";
import { appPath } from "@/lib/base-path";

/** Print, or take a prescription out of the patient's own list. */
export default function PortalVisitActions({ id }: { id: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function hide() {
    setBusy(true);
    await fetch(appPath(`/api/portal/visits/${id}/hide`), { method: "POST" });
    window.location.assign(appPath("/p"));
  }

  return (
    <div className="btnrow noprint" style={{ marginBottom: 18 }}>
      <button type="button" onClick={() => window.print()}>
        <IcPrint size={16} /> Print
      </button>
      {confirm ? (
        <>
          <span className="muted">Take this out of your list? Its code brings it back.</span>
          <button type="button" className="ghost danger-btn" onClick={hide} disabled={busy}>
            Remove
          </button>
          <button type="button" className="quiet" onClick={() => setConfirm(false)} disabled={busy}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="ghost" onClick={() => setConfirm(true)}>
          Remove from my list
        </button>
      )}
    </div>
  );
}
