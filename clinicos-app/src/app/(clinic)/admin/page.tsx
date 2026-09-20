import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  clinicNumbers,
  collectedSince,
  databaseStats,
  patientsWhoCameBack,
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
import { getBillingSettings, getClinic, getClinicTerms } from "@/lib/clinic";
import { termsInForce } from "@/lib/terms";
import ClinicTermsCard from "@/components/ClinicTerms";
import { formatPaise } from "@/lib/money";
import { listBackups } from "@/lib/backup";
import BackupPanel from "@/components/BackupPanel";
import SyncPanel from "@/components/SyncPanel";
import DevicesPanel from "@/components/DevicesPanel";
import { SYNC_CLIENT_ENABLED, getSyncStatus } from "@/lib/sync-client";
import { listDevices } from "@/lib/sync-server";
import DeletePatient from "@/components/DeletePatient";
import ClinicSettingsForm from "@/components/ClinicSettingsForm";
import PrescriptionSettings from "@/components/PrescriptionSettings";
import BillingSettings from "@/components/BillingSettings";
import AiSettings from "@/components/AiSettings";
import { getAiConfigView } from "@/lib/ai-settings";
import GettingStarted, { type Step } from "@/components/GettingStarted";
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

/** Collected at the desk on each of the clinic's last seven days: plain sums,
 *  cancelled bills left out. */
async function collectedByDay(clinicId: ClinicId) {
  const days = Array.from({ length: 7 }, (_, i) => clinicDayAt(i - 6));
  const got = new Map((await collectedSince(clinicId, localDay(days[0]))).map((r) => [r.day, r]));
  return days.map((d) => ({ d, total: got.get(localDay(d))?.total ?? 0, count: got.get(localDay(d))?.count ?? 0 }));
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

  const numbers = await clinicNumbers(user.clinicId);
  const stats = await databaseStats(user.clinicId, numbers);
  const backups = await listBackups();
  const patients = await searchPatients(user.clinicId, "");
  const activePeople = (await listUsers(user.clinicId)).filter((u) => u.active).length;
  const week = await signedByDoctor(user.clinicId);
  const steps = await stepTimes(user.clinicId, localDayBounds(clinicDayAt(-6))[0]);
  const clinic = await getClinic(user.clinicId);
  const billing = await getBillingSettings(user.clinicId);
  const terms = await getClinicTerms(user.clinicId);
  // Temporary: the AI service is normally set by Varaxis outside the app.
  const ai = await getAiConfigView(user.clinicId);
  const collected = await collectedByDay(user.clinicId);
  const cameBack = await patientsWhoCameBack(user.clinicId);
  const tenant = MULTI_CLINIC ? await getTenant(user.clinicId) : undefined;
  const address = tenant ? `${await publicAppUrl()}${clinicPath(tenant.slug)}` : null;
  // Online, a clinic whose plan includes it can connect its own computers; on a
  // clinic computer, this is where it connects to its clinic online.
  const devices = tenant && parseFeatures(tenant.features).localSync ? await listDevices(user.clinicId) : null;
  const syncStatus = SYNC_CLIENT_ENABLED ? await getSyncStatus() : null;

  // What a new clinic still has to do (backlog #34). It goes away by itself.
  const todo: Step[] = [
    {
      label: "Accept ClinicOS's terms",
      done: termsInForce(terms),
      hint: "Once, for the clinic. Until then nothing can be recorded.",
    },
    {
      label: "Put the clinic on its prescriptions",
      done: !!clinic.address.trim(),
      hint: "Name, address and phone number, as patients should see them.",
    },
    {
      label: "Set the consultation fee",
      done: billing.feePaise !== null,
      hint: "Every new bill starts with it, so the desk types less.",
    },
    {
      label: "Add the people who work here",
      done: activePeople > 1,
      hint: "Each person signs in as themselves; the log then means something.",
      href: "/admin/users",
    },
    {
      label: "Register the first patient",
      done: stats.patients > 0,
      hint: "From Today: find or register, then start the visit.",
      href: "/",
    },
    ...(ONLINE
      ? []
      : [
          {
            label: "Take the first backup",
            done: backups.length > 0,
            hint: "One tap below. ClinicOS then keeps a daily one by itself.",
          },
        ]),
  ];

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="eyebrow">Configuration</div>
        <h1>Clinic admin</h1>
        <p className="sub">Clinic details, people, backups and data removal.</p>
      </div>

      <GettingStarted steps={todo} />

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

      {/* Recording is off until this is accepted, so it comes first when it is not. */}
      {!termsInForce(terms) && <ClinicTermsCard terms={terms} inForce={false} canAccept />}

      <div className="card flush">
        <div className="card-head">
          <span className="title">Clinic details</span>
          <span className="muted">printed on every prescription</span>
        </div>
        <div className="card-body">
          <ClinicSettingsForm initial={{ name: clinic.name, address: clinic.address, phone: clinic.phone }} />
        </div>
      </div>

      <PrescriptionSettings logo={clinic.logo} cardLanguage={clinic.cardLanguage} />

      <BillingSettings feePaise={billing.feePaise} recallMessage={billing.recallMessage} ownerPhone={billing.ownerPhone} />

      <AiSettings initial={ai} />

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
          <span className="title">Collected, last 7 days</span>
          <span className="muted">cancelled bills left out</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="week">
            <thead>
              <tr>
                <th />
                {collected.map(({ d }) => (
                  <th key={d.toISOString()} className="num">
                    {fmtDate(d, { weekday: "short" })}
                    <div className="sub">{fmtDate(d, { day: "numeric" })}</div>
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 580 }}>Collected</td>
                {collected.map(({ d, total }) => (
                  <td key={d.toISOString()} className={`num ${total === 0 ? "dim" : ""}`}>{formatPaise(total)}</td>
                ))}
                <td className="num" style={{ fontWeight: 620 }}>{formatPaise(collected.reduce((a, b) => a + b.total, 0))}</td>
              </tr>
              <tr>
                <td className="dim">Receipts</td>
                {collected.map(({ d, count }) => (
                  <td key={d.toISOString()} className="num dim">{count}</td>
                ))}
                <td className="num dim">{collected.reduce((a, b) => a + b.count, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
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
          <span className="title">Patients who came back</span>
          <span className="muted">signed visits only</span>
        </div>
        <div className="card-body">
          {cameBack.seen === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No visits have been signed yet.</p>
          ) : (
            <p style={{ margin: 0 }}>
              <strong style={{ fontSize: 20 }}>
                {cameBack.again} of {cameBack.seen}
              </strong>{" "}
              <span className="muted">
                patients have more than one signed visit ({Math.round((cameBack.again / cameBack.seen) * 100)}%). A plain
                count of what happened, over all time.
              </span>
            </p>
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

      {devices && address && (
        <DevicesPanel
          devices={devices.map(({ keyHash, ...d }) => (void keyHash, d))}
          endpoint={appPath("/api/admin/devices")}
          address={address}
        />
      )}
      {syncStatus && <SyncPanel initial={syncStatus} />}

      {termsInForce(terms) && <ClinicTermsCard terms={terms} inForce canAccept />}

      <DeletePatient
        patients={patients.map((p) => ({ id: p.id, name: p.name, consultCount: p.consultCount }))}
      />
    </div>
  );
}
