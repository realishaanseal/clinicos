import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { databaseStats, listUsers, searchPatients } from "@/lib/db";
import { getClinic } from "@/lib/clinic";
import { listBackups } from "@/lib/backup";
import BackupPanel from "@/components/BackupPanel";
import DeletePatient from "@/components/DeletePatient";
import ClinicSettingsForm from "@/components/ClinicSettingsForm";
import { IcArrow } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireUser("admin");

  const stats = databaseStats();
  const backups = await listBackups();
  const patients = searchPatients("");
  const activePeople = listUsers().filter((u) => u.active).length;

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="eyebrow">Configuration</div>
        <h1>Clinic admin</h1>
        <p className="sub">Clinic details, people, backups and data removal.</p>
      </div>

      <div className="card flush">
        <div className="card-head">
          <span className="title">Clinic details</span>
          <span className="muted">printed on every prescription</span>
        </div>
        <div className="card-body">
          <ClinicSettingsForm initial={getClinic()} />
        </div>
      </div>

      <div className="card flush">
        <div className="card-head">
          <span className="title">People and activity</span>
        </div>
        <div>
          <div className="delrow">
            <div>
              <strong>People</strong>
              <span className="dim" style={{ marginLeft: 8, fontSize: 13 }}>
                {activePeople} active account{activePeople === 1 ? "" : "s"}
              </span>
            </div>
            <Link href="/admin/users" className="muted" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              Manage <IcArrow size={14} />
            </Link>
          </div>
          <div className="delrow">
            <div>
              <strong>Activity log</strong>
              <span className="dim" style={{ marginLeft: 8, fontSize: 13 }}>
                sign-ins, signed notes, exports, deletions, restores
              </span>
            </div>
            <Link href="/admin/audit" className="muted" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              Open <IcArrow size={14} />
            </Link>
          </div>
        </div>
      </div>

      <div className="card flush">
        <div className="card-head">
          <span className="title">Storage</span>
        </div>
        <div className="card-body">
          <dl className="kv">
            <div><dt>Patients</dt><dd>{stats.patients}</dd></div>
            <div><dt>Consultations</dt><dd>{stats.consults} ({stats.signed} signed)</dd></div>
            <div><dt>Edit records</dt><dd>{stats.edits}</dd></div>
            <div><dt>Database file</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{stats.path}</dd></div>
          </dl>
          <p className="muted" style={{ marginBottom: 0 }}>
            Everything lives in that one file. Back it up with the buttons below rather than copying it by
            hand: a plain copy can quietly miss the most recent consultations.
          </p>
        </div>
      </div>

      <BackupPanel backups={backups} lastBackupAt={backups[0]?.createdAt ?? null} />

      <DeletePatient
        patients={patients.map((p) => ({ id: p.id, name: p.name, consultCount: p.consultCount }))}
      />
    </div>
  );
}
