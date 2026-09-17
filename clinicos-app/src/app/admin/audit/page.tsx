import { requireUser } from "@/lib/auth";
import { listAudit } from "@/lib/db";
import { IcDoc } from "@/components/Icons";

export const dynamic = "force-dynamic";

const WHAT: Record<string, string> = {
  setup: "Set up ClinicOS",
  login: "Signed in",
  login_failed: "Sign-in failed",
  logout: "Signed out",
  password_change: "Changed their own password",
  user_create: "Added a person",
  user_update: "Changed a person's details or access",
  user_password_reset: "Reset a password",
  settings_update: "Changed clinic details",
  consult_sign: "Signed a consultation",
  patient_delete: "Deleted a patient record",
  patient_export: "Exported a patient record",
  export_all: "Exported all records",
  backup_download: "Downloaded a backup",
  backup_restore: "Restored from a backup",
};

export default async function AuditPage() {
  await requireUser("admin");
  const events = await listAudit(300);

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Clinic admin</div>
        <h1>Activity log</h1>
        <p className="sub">
          The most recent {events.length} events, newest first. The app only ever adds to this log; nothing in it
          can be edited.
        </p>
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
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="dim" style={{ whiteSpace: "nowrap" }}>
                    {new Date(e.at).toLocaleString("en-IN", {
                      day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                    })}
                  </td>
                  <td>{e.userName ?? <span className="dim">—</span>}</td>
                  <td>{WHAT[e.action] ?? e.action}</td>
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
