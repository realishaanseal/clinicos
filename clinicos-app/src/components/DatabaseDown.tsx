import type { ReactNode } from "react";
import { Mark } from "@/components/Icons";
import { isDatabaseUnreachable } from "@/lib/sql";

/**
 * The records cannot be reached: the clinic's front door says so plainly.
 *
 * The generic error screen is wrong here in three ways. Nobody at a sign-in
 * screen was part-way through writing anything, so "nothing you had written
 * has been lost" asks a question that was never in their head; there is no
 * unfinished consultation to go back to; and its way out leads to Today,
 * which needs the same records and stops in the same place — a loop. So this
 * screen says what is actually true, and offers only the one thing that can
 * help: trying again once the records are back.
 *
 * It names no cause. Whether the database is down, gone or misconfigured is
 * Varaxis's to read in the log, and none of it is actionable by a clinic.
 */
export default function DatabaseDown({ retry }: { retry: string }) {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="mark">
            <Mark size={21} />
          </span>
          <div>
            <div className="name">ClinicOS</div>
            <div className="tag">Records unavailable</div>
          </div>
        </div>
        <h1>ClinicOS can&apos;t reach your records</h1>
        <p className="sub">
          ClinicOS itself is running, but the records it keeps are not answering, so nobody can sign in just now.
          Nothing that was saved has been lost, and there is nothing here for you to fix. If this is still here in a
          few minutes, tell Varaxis.
        </p>
        <a className="btn wide" href={retry} style={{ justifyContent: "center" }}>
          Try again
        </a>
      </div>
    </main>
  );
}

/**
 * Renders one of the screens anyone can reach — sign-in, a clinic's own
 * address, first-time setup — and puts the screen above in its place if the
 * records cannot be reached.
 *
 * Only that one failure is answered here. A redirect unwinds by throwing, and
 * a real fault is a real fault: both are passed on untouched, so nothing here
 * can turn a bug into a reassuring screen.
 */
export async function orRecordsUnavailable(retry: string, render: () => Promise<ReactNode>): Promise<ReactNode> {
  try {
    return await render();
  } catch (e) {
    if (!isDatabaseUnreachable(e)) throw e;
    // The whole of what Varaxis needs in the log. A connection that was
    // refused carries nothing about any patient.
    console.error("ClinicOS could not reach its database:", e);
    return <DatabaseDown retry={retry} />;
  }
}
