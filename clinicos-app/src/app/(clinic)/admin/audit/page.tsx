import { requireUser } from "@/lib/auth";
import { listAudit } from "@/lib/db";
import { IcDoc } from "@/components/Icons";
import { fmt } from "@/lib/time";

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
  clinic_create: "Varaxis created this clinic",
  clinic_update: "Varaxis changed this clinic's plan or status",
  clinic_setup_code: "Varaxis issued a new setup code",
  sync_connect: "Connected a clinic computer to ClinicOS online",
  sync_disconnect: "Stopped keeping this computer in step with ClinicOS online",
  sync_device_create: "Made a key for a clinic computer",
  sync_device_revoke: "Switched a clinic computer off",
  consult_share: "Shared a prescription with the patient",
  consult_share_revoke: "Stopped sharing a prescription",
  bill_create: "Made a bill",
  bill_pay: "Took a payment",
  bill_void: "Cancelled a bill",
  followup_messaged: "Messaged a patient about their follow-up",
  followup_dismissed: "Marked a follow-up not needed",
  terms_accept: "Accepted the ClinicOS terms for the clinic",
};

export default async function AuditPage() {
  const user = await requireUser("admin");
  const events = await listAudit(user.clinicId, 300);

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
                    {fmt(new Date(e.at), {
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
