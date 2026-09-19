import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  databaseStats,
  getTenant,
  listUsers,
  localDay,
  searchPatients,
  signedConsultsSince,
  stepTimingsSince,
  type ClinicId,
} from "@/lib/db";
import { MULTI_CLINIC, PLANS, clinicPath, parseFeatures } from "@/lib/tenant";
import { publicAppUrl } from "@/lib/public-url";
import { clinicDayAt, fmtDate, localDayBounds } from "@/lib/time";
import { getClinic } from "@/lib/clinic";
import { listBackups } from "@/lib/backup";
import BackupPanel from "@/components/BackupPanel";
import DeletePatient from "@/components/DeletePatient";
import ClinicSettingsForm from "@/components/ClinicSettingsForm";
import { IcArrow, IcShield } from "@/components/Icons";
import { ONLINE } from "@/lib/deployment";
import { appPath } from "@/lib/base-path";

export const dynamic = "force-dynamic";

/** Signed consultations per doctor for the last seven local days. Raw counts:
 *  no averages, no rankings, nothing that reads as a performance score. */
async function signedByDoctor(clinicId: ClinicId) {
  // The clinic's last seven days, not the server's: online the server is on UTC.
  const days = Array.from({ length: 7 }, (_, i) => clinicDayAt(i - 6));
  const dayKeys = days.map((d) => localDay(d));
  const counts = new Map<string, number[]>();
  for (const s of await signedConsultsSince(clinicId, localDayBounds(days[0])[0])) {
    const idx = dayKeys.indexOf(localDay(new Date(s.signedAt)));
    if (idx < 0) continue;
    const who = s.doctorName ?? "Signed before accounts";
    if (!counts.has(who)) counts.set(who, Array(7).fill(0));
    counts.get(who)![idx]++;
  }
  return { days, rows: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])) };
}

/** "45 s", "3 min 20 s", "12 min", "1 h 5 min". */
function duration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 10) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

const secondsBetween = (from: string | null, to: string | null) =>
  from && to ? Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000) : null;

/**
 * How long each step of a consultation takes, over the last seven days
 * (backlog #3, the speed pass). The middle value and the longest, with how many
 * visits each is measured over — never an average that one stuck tab can
 * wreck, and no score. Visits signed before these times were recorded simply
 * do not count towards the steps they lack.
 */
async function stepTimes(clinicId: ClinicId, sinceIso: string) {
  const rows = await stepTimingsSince(clinicId, sinceIso);
  const drafted = rows.filter((r) => r.drafted);
  const byHand = rows.filter((r) => !r.drafted);
  const steps: [string, (number | null)[]][] = [
    ["Recording", drafted.map((r) => r.audioSeconds)],
    ["Waiting for the transcript", drafted.map((r) => r.asrSeconds)],
    ["Waiting for the AI draft", drafted.map((r) => r.llmSeconds)],
    ["Reviewing and signing the draft", drafted.map((r) => secondsBetween(r.draftedAt, r.signedAt))],
    ["Whole visit, AI-drafted", drafted.map((r) => secondsBetween(r.createdAt, r.signedAt))],
    ["Whole visit, written by hand", byHand.map((r) => secondsBetween(r.createdAt, r.signedAt))],
  ];
  return steps.map(([label, values]) => {
    const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
    return { label, n: v.length, middle: v.length ? v[Math.floor((v.length - 1) / 2)] : null, longest: v.at(-1) ?? null };
  });
}

export default async function AdminPage() {
  const user = await requireUser("admin");

  const stats = await databaseStats(user.clinicId);
  const backups = await listBackups();
  const patients = await searchPatients(user.clinicId, "");
  const activePeople = (await listUsers(user.clinicId)).filter((u) => u.active).length;
  const week = await signedByDoctor(user.clinicId);
  const steps = await stepTimes(user.clinicId, localDayBounds(clinicDayAt(-6))[0]);
  const tenant = MULTI_CLINIC ? await getTenant(user.clinicId) : undefined;
  const address = tenant ? `${await publicAppUrl()}${clinicPath(tenant.slug)}` : null;

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="eyebrow">Configuration</div>
        <h1>Clinic admin</h1>
        <p className="sub">Clinic details, people, backups and data removal.</p>
      </div>

      {tenant && address && (
        <div className="card flush">
          <div className="card-head">
            <span className="title">Your clinic on ClinicOS</span>
            <span className="muted">set by Varaxis</span>
          </div>
          <div className="card-body">
            <dl className="kv" style={{ marginBottom: 10 }}>
              <div><dt>Address</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{address}</dd></div>
              <div><dt>Clinic ID</dt><dd className="mono">{tenant.slug}</dd></div>
              <div><dt>Plan</dt><dd>{PLANS[tenant.plan] ?? tenant.plan}</dd></div>
              <div>
                <dt>Clinic computer</dt>
                <dd>{parseFeatures(tenant.features).localSync ? "Included: a clinic computer can keep in step with this" : "Not included"}</dd>
              </div>
            </dl>
            <p className="muted" style={{ margin: 0 }}>
              Everyone here signs in at that address. Bookmark it on every computer and phone the clinic uses.
            </p>
          </div>
        </div>
      )}

      <div className="card flush">
        <div className="card-head">
          <span className="title">Clinic details</span>
          <span className="muted">printed on every prescription</span>
        </div>
        <div className="card-body">
          <ClinicSettingsForm initial={await getClinic(user.clinicId)} />
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
          <span className="title">How long each step takes, last 7 days</span>
          <span className="muted">signed visits only</span>
        </div>
        {steps.every((st) => st.n === 0) ? (
          <div className="card-body">
            <p className="muted" style={{ margin: 0 }}>No consultations were signed in the last 7 days.</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="week">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th className="num">Visits</th>
                    <th className="num">Typical</th>
                    <th className="num">Longest</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((st) => (
                    <tr key={st.label}>
                      <td>{st.label}</td>
                      <td className={`num ${st.n ? "" : "dim"}`}>{st.n}</td>
                      <td className={`num ${st.middle === null ? "dim" : ""}`}>{st.middle === null ? "—" : duration(st.middle)}</td>
                      <td className={`num ${st.longest === null ? "dim" : ""}`}>{st.longest === null ? "—" : duration(st.longest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-body" style={{ paddingTop: 12 }}>
              <p className="muted" style={{ margin: 0 }}>
                Typical is the middle value: half the visits were quicker. Transcript and draft times depend on
                {ONLINE ? " the online AI service." : " this computer."} A visit counts from the moment it is
                opened, so one left open over lunch shows up as the longest.
              </p>
            </div>
          </>
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
              <a href={appPath("/api/backup/export")} download>
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
