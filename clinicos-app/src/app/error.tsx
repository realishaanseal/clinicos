"use client";

import { useEffect } from "react";
import { appPath } from "@/lib/base-path";
import { Mark } from "@/components/Icons";

/**
 * Whatever went wrong, said plainly. A doctor with a patient in front of them
 * needs to know two things: that nothing was lost, and what to press.
 *
 * The digest is the only thing that identifies this error in the server's log;
 * it carries no patient and nothing clinical.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="mark">
            <Mark size={21} />
          </span>
          <div>
            <div className="name">ClinicOS</div>
            <div className="tag">Something went wrong</div>
          </div>
        </div>
        <h1>This screen stopped</h1>
        <p className="sub">
          Nothing you had written has been lost: ClinicOS saves as you work, and an unfinished consultation waits for
          you on Today. Try again, and if it keeps happening, tell Varaxis the reference below.
        </p>
        <div className="btnrow">
          <button type="button" onClick={reset}>
            Try again
          </button>
          <a className="btn ghost" href={appPath("/")}>
            Back to Today
          </a>
        </div>
        {error.digest && (
          <p className="muted mono" style={{ marginBottom: 0 }}>
            Reference {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
