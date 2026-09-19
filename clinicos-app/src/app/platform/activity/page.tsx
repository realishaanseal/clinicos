import { requireOperator } from "@/lib/platform";
import { listPlatformAudit, listTenants } from "@/lib/db";
import { fmt } from "@/lib/time";
import { IcDoc } from "@/components/Icons";

export const dynamic = "force-dynamic";

const WHAT: Record<string, string> = {
  operator_login: "Signed in",
  operator_login_failed: "Sign-in failed",
  operator_logout: "Signed out",
  operator_password_change: "Changed their password",
  operator_create: "Operator account created",
  operator_password_reset: "Operator password reset",
  operator_deactivate: "Operator account switched off",
  clinic_create: "Created a clinic",
  clinic_update: "Changed a clinic",
  clinic_setup_code: "Made a new setup code",
};

/** What operators have done. A clinic's own activity is its own business and
 *  is not shown here. */
export default async function PlatformActivityPage() {
  await requireOperator();
  const events = await listPlatformAudit(200);
  const names = new Map((await listTenants()).map((t) => [t.id as string, t.name]));

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Varaxis platform</div>
        <h1>Activity</h1>
        <p className="sub">Operator sign-ins and every change made to a clinic, newest first.</p>
      </div>
      <div className="card flush">
        {events.length === 0 ? (
          <div className="empty">
            <IcDoc size={26} />
            <div className="big" style={{ marginTop: 10 }}>Nothing recorded yet</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Clinic</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="dim" style={{ whiteSpace: "nowrap" }}>
                    {fmt(e.at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td>{e.userName ?? <span className="dim">—</span>}</td>
                  <td>{WHAT[e.action] ?? e.action}</td>
                  <td>{e.clinicId && e.action.startsWith("clinic_") ? names.get(e.clinicId) ?? e.clinicId : <span className="dim">—</span>}</td>
                  <td className="dim">{e.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
