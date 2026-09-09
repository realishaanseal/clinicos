import { searchPatients, databaseStats } from "@/lib/db";
import { clinic } from "@/lib/clinic";
import DeletePatient from "@/components/DeletePatient";
import BackupPanel from "@/components/BackupPanel";
import { listBackups } from "@/lib/backup";
import { IcShield } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const patients = searchPatients("");
  const stats = databaseStats();
  const backups = await listBackups();

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="eyebrow">Configuration</div>
        <h1>Settings</h1>
        <p className="sub">Clinic identity, storage, and data removal.</p>
      </div>

      <div className="card flush">
        <div className="card-head">
          <span className="title">Clinic identity</span>
          <span className="muted">edit in .env, then restart</span>
        </div>
        <div className="card-body">
          <dl className="kv">
            <div><dt>Clinic</dt><dd>{clinic.name}</dd></div>
            <div><dt>Address</dt><dd>{clinic.address || <span className="dim">not set</span>}</dd></div>
            <div><dt>Phone</dt><dd>{clinic.phone || <span className="dim">not set</span>}</dd></div>
            <div><dt>Doctor</dt><dd>{clinic.doctorName}</dd></div>
            <div><dt>Qualification</dt><dd>{clinic.doctorQualification || <span className="dim">not set</span>}</dd></div>
            <div><dt>Registration no.</dt><dd>{clinic.doctorRegNo || <span className="dim">not set</span>}</dd></div>
          </dl>
          {(clinic.name === "Demo Clinic" || clinic.doctorName === "Dr. Demo") && (
            <div className="note info">
              <IcShield size={17} />
              <span>
                These still show the placeholder values, and they print on every prescription. Set
                <span className="mono"> CLINIC_NAME</span> and <span className="mono">DOCTOR_NAME</span> in
                your <span className="mono">.env</span> file before showing this to anyone.
              </span>
            </div>
          )}
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
            Everything lives in that one file. Copy it to back up — do this before every demo.
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
