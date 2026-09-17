import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { databaseStats, listUsers, localDay, searchPatients, signedConsultsSince } from "@/lib/db";
import { clinicDayAt, fmtDate, localDayBounds } from "@/lib/time";
import { getClinic } from "@/lib/clinic";
import { listBackups } from "@/lib/backup";
import BackupPanel from "@/components/BackupPanel";
import DeletePatient from "@/components/DeletePatient";
import ClinicSettingsForm from "@/components/ClinicSettingsForm";
import { IcArrow, IcShield } from "@/components/Icons";
import { ONLINE } from "@/lib/deployment";

export const dynamic = "force-dynamic";

/** Signed consultations per doctor for the last seven local days. Raw counts:
 *  no averages, no rankings, nothing that reads as a performance score. */
async function signedByDoctor() {
  // The clinic's last seven days, not the server's: online the server is on UTC.
  const days = Array.from({ length: 7 }, (_, i) => clinicDayAt(i - 6));
  const dayKeys = days.map((d) => localDay(d));
  const counts = new Map<string, number[]>();
  for (const s of await signedConsultsSince(localDayBounds(days[0])[0])) {
    const idx = dayKeys.indexOf(localDay(new Date(s.signedAt)));
    if (idx < 0) continue;
    const who = s.doctorName ?? "Signed before accounts";
    if (!counts.has(who)) counts.set(who, Array(7).fill(0));
    counts.get(who)![idx]++;
  }
  return { days, rows: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])) };
}

export default async function AdminPage() {
  await requireUser("admin");

  const stats = await databaseStats();
  const backups = await listBackups();
  const patients = await searchPatients("");
  const activePeople = (await listUsers()).filter((u) => u.active).length;
  const week = await signedByDoctor();

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
          <ClinicSettingsForm initial={await getClinic()} />
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
          <span className="title">Consultations signed, last 7 days</span>
          <span className="muted">counts only</span>
        </div>
        {week.rows.length === 0 ? (
          <div className="card-body">
            <p className="muted" style={{ margin: 0 }}>No consultations were signed in the last 7 days.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="week">
              <thead>
                <tr>
                  <th>Doctor</th>
                  {week.days.map((d) => (
                    <th key={d.toISOString()} className="num">
                      {fmtDate(d, { weekday: "short" })}
                      <div className="sub">{fmtDate(d, { day: "numeric" })}</div>
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {week.rows.map(([who, perDay]) => (
                  <tr key={who}>
                    <td style={{ fontWeight: 580 }}>{who}</td>
                    {perDay.map((n, i) => (
                      <td key={i} className={`num ${n === 0 ? "dim" : ""}`}>{n}</td>
                    ))}
                    <td className="num" style={{ fontWeight: 620 }}>{perDay.reduce((a, b) => a + b, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
            <div><dt>{ONLINE ? "Database" : "Database file"}</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{stats.path}</dd></div>
          </dl>
          <p className="muted" style={{ marginBottom: 0 }}>
            {ONLINE
              ? "This is the online prototype. Its database keeps no backups, so use made-up patients only."
              : "Everything lives in that one file. Back it up with the buttons below rather than copying it by hand: a plain copy can quietly miss the most recent consultations."}
          </p>
        </div>
      </div>

      {ONLINE ? (
        // Backup files are copies of the clinic computer's SQLite database. There
        // is no such file online, so only the export is offered.
        <div className="card">
          <div className="card-head">
            <span className="title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IcShield size={16} /> Take a copy
            </span>
          </div>
          <div className="card-body">
            <p className="muted" style={{ marginTop: 0 }}>
              Download every patient, consultation and correction as one file, readable in any text editor.
            </p>
            <div className="btnrow">
              <a href="/api/backup/export" download>
                <button type="button">Export everything as JSON</button>
              </a>
            </div>
          </div>
        </div>
      ) : (
        <BackupPanel backups={backups} lastBackupAt={backups[0]?.createdAt ?? null} />
      )}

      <DeletePatient
        patients={patients.map((p) => ({ id: p.id, name: p.name, consultCount: p.consultCount }))}
      />
    </div>
  );
}
