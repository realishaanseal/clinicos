/**
 * Storage. Plain SQL, no ORM.
 *
 * Every query in the app is here. On the clinic computer they run against a
 * single SQLite file (./data/clinicos.db); online they run against Postgres.
 * sql.ts decides which, and explains the handful of rules that let one query
 * serve both. Back up the SQLite file with the tools in backup.ts, never by
 * copying it — see the WAL note there.
 *
 * Everything is async, because Postgres is. The SQLite side answers at once.
 */
import { randomBytes } from "node:crypto";
import { BACKEND, DB_PATH, FIRST_CLINIC, isUniqueViolation, q, tx } from "./sql";
import { localDay, localDayBounds } from "./time";
import { planOf, type Plan } from "./types";

export { localDay };

// ---------------------------------------------------------------- clinics
/**
 * Online, one database holds many clinics. Every query below that reads or
 * changes a clinic's records takes the clinic's id first and says
 * `"clinicId" = ?` in its WHERE clause — including updates and deletes whose
 * row was already checked, so a missed check upstream still cannot reach
 * another clinic's record.
 *
 * ClinicId is a string the compiler tells apart from other strings. It comes
 * from the signed-in account's session, never from the request, and swapping
 * it with a record id is a type error rather than a quiet leak.
 */
declare const clinicBrand: unique symbol;
export type ClinicId = string & { readonly [clinicBrand]: true };

/** Only for ids read back from the database or a verified credential. */
export function asClinicId(id: string): ClinicId {
  return id as ClinicId;
}

/** The only clinic on a clinic computer; the first one online. */
export const FIRST_CLINIC_ID = asClinicId(FIRST_CLINIC);

/** Full human-readable export. Deliberately independent of the database so the
 *  clinic's records survive even if this app does not. Accounts and sessions
 *  are left out: they are not clinical records, and hashes have no business
 *  in a file people email around. */
export async function exportEverything(clinicId: ClinicId) {
  const patients = await q().all<Patient>(
    `SELECT * FROM "Patient" WHERE "clinicId" = ? ORDER BY "createdAt"`,
    clinicId
  );
  // Five queries for the whole clinic, grouped here: a clinic with years of
  // records must be able to take everything with it (invariant 8), and one
  // query per visit would take minutes.
  const consults = await q().all<Consult>(`SELECT * FROM "Consult" WHERE "clinicId" = ? ORDER BY "createdAt"`, clinicId);
  const edits = await q().all<{ consultId: string; field: string; before: string; after: string; createdAt: string }>(
    `SELECT "consultId", field, before, after, "createdAt" FROM "Edit" WHERE "clinicId" = ? ORDER BY "createdAt"`,
    clinicId
  );
  const bills = await q().all<Bill>(`SELECT * FROM "Bill" WHERE "clinicId" = ? ORDER BY "createdAt"`, clinicId);
  const recalls = await q().all<{ patientId: string; consultId: string; action: string; at: string }>(
    `SELECT "patientId", "consultId", action, at FROM "Recall" WHERE "clinicId" = ? ORDER BY at`,
    clinicId
  );
  const by = <T, K extends keyof T>(rows: T[], key: K) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = String(r[key]);
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return m;
  };
  const editsOf = by(edits, "consultId");
  const consultsOf = by(consults, "patientId");
  const billsOf = by(bills, "patientId");
  const recallsOf = by(recalls, "patientId");

  const out = [];
  for (const p of patients) {
    const withEdits = (consultsOf.get(p.id) ?? []).map((c) => ({
      ...c,
      audioPath: undefined,
      edits: (editsOf.get(c.id) ?? []).map(({ consultId, ...e }) => (void consultId, e)),
    }));
    out.push({
      ...p,
      consults: withEdits,
      bills: exportBills(billsOf.get(p.id) ?? []),
      recalls: (recallsOf.get(p.id) ?? []).map(({ patientId, ...r }) => (void patientId, r)),
    });
  }
  // Favourites are the doctors' own work, so they leave with the clinic too.
  const favourites = await q().all<{ doctor: string | null; name: string; noteJson: string }>(
    `SELECT u.name AS doctor, f.name, f."noteJson" FROM "Favourite" f LEFT JOIN "User" u ON u.id = f."userId"
     WHERE f."clinicId" = ? ORDER BY u.name, LOWER(f.name)`,
    clinicId
  );
  return {
    format: "clinicos-full-export",
    version: 1,
    exportedAt: now(),
    patients: out,
    favourites: favourites.map((f) => ({ doctor: f.doctor, name: f.name, note: JSON.parse(f.noteJson) })),
  };
}

/** Bills as they leave in an export, with their lines read back into a list. */
function exportBills(bills: Bill[]) {
  return bills.map(({ itemsJson, ...b }) => ({ ...b, items: JSON.parse(itemsJson) as unknown }));
}

function editsFor(clinicId: ClinicId, consultId: string) {
  return q().all(
    `SELECT field, before, after, "createdAt" FROM "Edit" WHERE "clinicId" = ? AND "consultId" = ? ORDER BY "createdAt"`,
    clinicId, consultId
  );
}

// ---------------------------------------------------------------- helpers
/** Time first, so ids sort roughly by age, then ten random characters from the
 *  operating system's generator. Records made on a clinic computer and online
 *  may meet when the two are kept in step, so an id must never repeat anywhere. */
export function newId(): string {
  let rand = "";
  for (const b of randomBytes(10)) rand += (b % 36).toString(36);
  return Date.now().toString(36) + rand;
}
const now = () => new Date().toISOString();


// ---------------------------------------------------------------- types
export type Patient = {
  id: string;
  clinicId: string;
  name: string;
  age: number | null;
  sex: string | null;
  phone: string | null;
  guardianName: string | null;
  createdAt: string;
};

export type Consult = {
  id: string;
  clinicId: string;
  patientId: string;
  consentGiven: number;
  consentAt: string | null;
  consentBy: string | null;
  audioPath: string | null;
  audioBytes: number | null;
  audioSeconds: number | null;
  audioDeletedAt: string | null;
  transcript: string | null;
  asrModel: string | null;
  asrSeconds: number | null;
  draftJson: string | null;
  workingJson: string | null;
  workingSavedAt: string | null;
  recordingStartedAt: string | null;
  recordingEndedAt: string | null;
  finalJson: string | null;
  llmModel: string | null;
  llmSeconds: number | null;
  signedAt: string | null;
  createdBy: string | null;
  doctorId: string | null;
  transcribedAt: string | null;
  // How many parts of the recording the transcript already covers. Never
  // travels between copies: the recording it counts never does either.
  transcribedParts: number | null;
  draftedAt: string | null;
  followUpOn: string | null;
  createdAt: string;
};

export type ConsultWithPatient = Consult & { patient: Patient };

// ---------------------------------------------------------------- patients
export async function createPatient(
  clinicId: ClinicId,
  input: {
    name: string;
    age?: number | null;
    sex?: string | null;
    phone?: string | null;
    guardianName?: string | null;
  }
): Promise<Patient> {
  const id = newId();
  await q().run(
    `INSERT INTO "Patient" (id, "clinicId", name, age, sex, phone, "guardianName", "createdAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, clinicId, input.name, input.age ?? null, input.sex || null, input.phone || null, input.guardianName || null, now()
  );
  return (await getPatient(clinicId, id))!;
}

export function getPatient(clinicId: ClinicId, id: string): Promise<Patient | undefined> {
  return q().get<Patient>(`SELECT * FROM "Patient" WHERE id = ? AND "clinicId" = ?`, id, clinicId);
}

type PatientListRow = Patient & { consultCount: number };

/**
 * Find patients by name, or by phone number when the search is a number.
 *
 * Patients forget how their name was spelt last time; they never forget their
 * number (backlog #8). Phone matching ignores spaces, dashes, brackets and a
 * leading +91, because nobody types a number the way it was first written down.
 */
export async function searchPatients(clinicId: ClinicId, qText: string): Promise<PatientListRow[]> {
  const term = qText.trim();
  const base = `SELECT p.*, (SELECT CAST(COUNT(*) AS INTEGER) FROM "Consult" c WHERE c."patientId" = p.id) AS "consultCount"
                FROM "Patient" p WHERE p."clinicId" = ?`;
  if (!term) {
    return q().all<PatientListRow>(`${base} ORDER BY p."createdAt" DESC LIMIT 50`, clinicId);
  }

  const compact = term.replace(/[\s()+-]/g, "");
  if (/^\d{3,}$/.test(compact)) {
    const digits = compact.length > 10 ? compact.slice(-10) : compact;
    return q().all<PatientListRow>(
      `${base}
       AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(p.phone, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?
       ORDER BY p."createdAt" DESC LIMIT 50`,
      clinicId, `%${digits}%`
    );
  }

  // SQLite's LIKE ignores case and Postgres's does not; LOWER() on both sides
  // gives both the same answer.
  return q().all<PatientListRow>(
    `${base} AND LOWER(p.name) LIKE LOWER(?) ORDER BY p."createdAt" DESC LIMIT 50`,
    clinicId, `%${term}%`
  );
}

/**
 * Other patients on the same phone number (backlog #21, the cheap half).
 *
 * In Indian practice a household shares one number: the mother books, the
 * children and the grandfather are on it too. This is the fact ClinicOS
 * already has, said out loud — no household table, nothing to keep in step,
 * and nothing claimed about who is related to whom.
 */
export function samePhonePatients(clinicId: ClinicId, patientId: string, phone: string | null): Promise<Patient[]> {
  const digits = (phone ?? "").replace(/\D/g, "").slice(-10);
  if (digits.length < 10) return Promise.resolve([]);
  return q().all<Patient>(
    `SELECT * FROM "Patient"
     WHERE "clinicId" = ? AND id <> ?
       AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?
     ORDER BY LOWER(name) LIMIT 10`,
    clinicId, patientId, `%${digits}`
  );
}

// ---------------------------------------------------------------- consults
export async function createConsult(clinicId: ClinicId, patientId: string, createdBy: string | null = null): Promise<Consult> {
  const id = newId();
  await q().run(
    `INSERT INTO "Consult" (id, "clinicId", "patientId", "createdBy", "createdAt") VALUES (?, ?, ?, ?, ?)`,
    id, clinicId, patientId, createdBy, now()
  );
  return (await getConsult(clinicId, id))!;
}

export function getConsult(clinicId: ClinicId, id: string): Promise<Consult | undefined> {
  return q().get<Consult>(`SELECT * FROM "Consult" WHERE id = ? AND "clinicId" = ?`, id, clinicId);
}

export async function getConsultWithPatient(clinicId: ClinicId, id: string): Promise<ConsultWithPatient | undefined> {
  const c = await getConsult(clinicId, id);
  if (!c) return undefined;
  const p = await getPatient(clinicId, c.patientId);
  if (!p) return undefined;
  return { ...c, patient: p };
}

/** The patient's columns, joined to a consultation and renamed, so a list of
 *  visits is one query rather than one query per row. */
const PATIENT_JOIN = `p.id AS "p_id", p."clinicId" AS "p_clinicId", p.name AS "p_name", p.age AS "p_age", p.sex AS "p_sex",
                      p.phone AS "p_phone", p."guardianName" AS "p_guardianName", p."createdAt" AS "p_createdAt"`;

type JoinedRow = Consult & Record<string, unknown>;

function withPatient(row: JoinedRow): ConsultWithPatient {
  const consult: Record<string, unknown> = {};
  const patient: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("p_")) patient[k.slice(2)] = v;
    else consult[k] = v;
  }
  return { ...(consult as Consult), patient: patient as unknown as Patient };
}

export async function recentConsults(clinicId: ClinicId, limit = 25): Promise<ConsultWithPatient[]> {
  const rows = await q().all<JoinedRow>(
    `SELECT c.*, ${PATIENT_JOIN} FROM "Consult" c JOIN "Patient" p ON p.id = c."patientId"
     WHERE c."clinicId" = ? ORDER BY c."createdAt" DESC LIMIT ?`,
    clinicId, limit
  );
  return rows.map(withPatient);
}

export function consultsForPatient(clinicId: ClinicId, patientId: string): Promise<(Consult & { editCount: number })[]> {
  return q().all<Consult & { editCount: number }>(
    `SELECT c.*, CAST((SELECT COUNT(*) FROM "Edit" e WHERE e."clinicId" = c."clinicId" AND e."consultId" = c.id) AS INTEGER) AS "editCount"
     FROM "Consult" c WHERE c."clinicId" = ? AND c."patientId" = ? ORDER BY c."createdAt" DESC`,
    clinicId, patientId
  );
}

export function previousSignedConsults(clinicId: ClinicId, patientId: string, excludeId: string, limit = 3): Promise<Consult[]> {
  return q().all<Consult>(
    `SELECT * FROM "Consult"
     WHERE "clinicId" = ? AND "patientId" = ? AND id != ? AND "signedAt" IS NOT NULL
     ORDER BY "signedAt" DESC LIMIT ?`,
    clinicId, patientId, excludeId, limit
  );
}

export async function setConsent(clinicId: ClinicId, id: string, by: string) {
  await q().run(
    `UPDATE "Consult" SET "consentGiven" = 1, "consentAt" = ?, "consentBy" = ? WHERE id = ? AND "clinicId" = ?`,
    now(), by, id, clinicId
  );
}

export async function setAudio(clinicId: ClinicId, id: string, audioPath: string, bytes: number, seconds: number | null) {
  await q().run(
    `UPDATE "Consult" SET "audioPath" = ?, "audioBytes" = ?, "audioSeconds" = ? WHERE id = ? AND "clinicId" = ?`,
    audioPath, bytes, seconds, id, clinicId
  );
}

export async function setTranscript(
  clinicId: ClinicId, id: string, transcript: string, model: string, seconds: number, parts: number
) {
  await q().run(
    `UPDATE "Consult" SET transcript = ?, "asrModel" = ?, "asrSeconds" = ?, "transcribedAt" = ?, "transcribedParts" = ?
     WHERE id = ? AND "clinicId" = ?`,
    transcript, model, seconds, now(), parts, id, clinicId
  );
}

export async function setDraft(clinicId: ClinicId, id: string, transcript: string, draftJson: string, model: string, seconds: number) {
  await q().run(
    `UPDATE "Consult" SET transcript = ?, "draftJson" = ?, "llmModel" = ?, "llmSeconds" = ?, "draftedAt" = ?
     WHERE id = ? AND "clinicId" = ?`,
    transcript, draftJson, model, seconds, now(), id, clinicId
  );
}

/** followUpOn is the note's date to come back, copied to its own column so the
 *  desk's follow-up list is a plain query rather than a read of every note. */
export async function signConsult(
  clinicId: ClinicId,
  id: string,
  finalJson: string,
  audioDeleted: boolean,
  doctorId: string | null,
  followUpOn: string | null = null
) {
  await q().run(
    `UPDATE "Consult"
     SET "finalJson" = ?, "signedAt" = ?, "audioPath" = NULL, "audioDeletedAt" = ?,
         "workingJson" = NULL, "recordingEndedAt" = COALESCE("recordingEndedAt", ?), "doctorId" = ?, "followUpOn" = ?
     WHERE id = ? AND "clinicId" = ?`,
    finalJson, now(), audioDeleted ? now() : null, now(), doctorId, followUpOn || null, id, clinicId
  );
}

// ------------------------------------------------------------------- edits
export async function addEdits(clinicId: ClinicId, consultId: string, edits: { field: string; before: string; after: string }[]) {
  if (!edits.length) return;
  await tx(async () => {
    for (const e of edits) {
      await q().run(
        `INSERT INTO "Edit" (id, "clinicId", "consultId", field, before, after, "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?)`,
        newId(), clinicId, consultId, e.field, e.before, e.after, now()
      );
    }
  });
}

async function count(sql: string, ...params: string[]): Promise<number> {
  return (await q().get<{ n: number }>(sql, ...params))?.n ?? 0;
}

export function countEdits(clinicId: ClinicId, consultId?: string): Promise<number> {
  return consultId
    ? count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Edit" WHERE "clinicId" = ? AND "consultId" = ?`, clinicId, consultId)
    : count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Edit" WHERE "clinicId" = ?`, clinicId);
}

/**
 * Every number Today and Clinic admin show, in three passes instead of six
 * separate counts. On a clinic with five thousand patients that was the
 * slowest thing on the screen a doctor opens most.
 */
export type ClinicNumbers = {
  patients: number;
  consults: number;
  consultsToday: number;
  signed: number;
  /** Signed visits that began as an AI draft: what "time saved" counts. */
  drafted: number;
  edits: number;
};

export async function clinicNumbers(clinicId: ClinicId): Promise<ClinicNumbers> {
  // The clinic's local day, not the server's: in India a UTC date files
  // everything before 05:30 under yesterday.
  const [start, end] = localDayBounds();
  const c = await q().get<{ consults: number; consultsToday: number; signed: number; drafted: number }>(
    `SELECT CAST(COUNT(*) AS INTEGER) AS consults,
            CAST(COALESCE(SUM(CASE WHEN "createdAt" >= ? AND "createdAt" < ? THEN 1 ELSE 0 END), 0) AS INTEGER) AS "consultsToday",
            CAST(COALESCE(SUM(CASE WHEN "signedAt" IS NOT NULL THEN 1 ELSE 0 END), 0) AS INTEGER) AS signed,
            CAST(COALESCE(SUM(CASE WHEN "signedAt" IS NOT NULL AND "draftJson" IS NOT NULL THEN 1 ELSE 0 END), 0) AS INTEGER) AS drafted
     FROM "Consult" WHERE "clinicId" = ?`,
    start, end, clinicId
  );
  return {
    patients: await countPatients(clinicId),
    consults: c?.consults ?? 0,
    consultsToday: c?.consultsToday ?? 0,
    signed: c?.signed ?? 0,
    drafted: c?.drafted ?? 0,
    edits: await countEdits(clinicId),
  };
}

/** Minutes of documentation saved, at a conservative 4 minutes per signed,
 *  AI-drafted note (see minutesSaved). */
export const minutesSavedFrom = (n: ClinicNumbers) => n.drafted * 4;

export function countSignedConsults(clinicId: ClinicId): Promise<number> {
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE "clinicId" = ? AND "signedAt" IS NOT NULL`, clinicId);
}

export function countPatients(clinicId: ClinicId): Promise<number> {
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Patient" WHERE "clinicId" = ?`, clinicId);
}

export function countConsultsToday(clinicId: ClinicId): Promise<number> {
  // The clinic's local day. Comparing the UTC date put every consultation
  // before 05:30 IST under the previous day.
  const [start, end] = localDayBounds();
  return count(
    `SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE "clinicId" = ? AND "createdAt" >= ? AND "createdAt" < ?`,
    clinicId, start, end
  );
}

/** Signed consultations since a moment, with the signing doctor's name. Raw
 *  rows for simple counting — no scores, no rankings. */
export function signedConsultsSince(clinicId: ClinicId, sinceIso: string): Promise<{ doctorName: string | null; signedAt: string }[]> {
  return q().all(
    `SELECT u.name AS "doctorName", c."signedAt"
     FROM "Consult" c LEFT JOIN "User" u ON u.id = c."doctorId"
     WHERE c."clinicId" = ? AND c."signedAt" IS NOT NULL AND c."signedAt" >= ?
     ORDER BY c."signedAt"`,
    clinicId, sinceIso
  );
}

/** Signed notes that began as an AI draft. A note the doctor wrote by hand
 *  saved them nothing and had nothing to correct, so it counts in neither the
 *  time saved nor the edits per note. */
export function countDraftedSignedConsults(clinicId: ClinicId): Promise<number> {
  return count(
    `SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE "clinicId" = ? AND "signedAt" IS NOT NULL AND "draftJson" IS NOT NULL`,
    clinicId
  );
}

/** Signed consultations since a moment, with only the timing of each step:
 *  no patient, no note, nothing clinical. For the speed pass (backlog #3). */
export type StepTiming = {
  createdAt: string;
  signedAt: string;
  drafted: number;
  audioSeconds: number | null;
  asrSeconds: number | null;
  llmSeconds: number | null;
  recordingEndedAt: string | null;
  transcribedAt: string | null;
  draftedAt: string | null;
};

export function stepTimingsSince(clinicId: ClinicId, sinceIso: string): Promise<StepTiming[]> {
  return q().all<StepTiming>(
    `SELECT "createdAt", "signedAt", CASE WHEN "draftJson" IS NULL THEN 0 ELSE 1 END AS drafted,
            "audioSeconds", "asrSeconds", "llmSeconds", "recordingEndedAt", "transcribedAt", "draftedAt"
     FROM "Consult" WHERE "clinicId" = ? AND "signedAt" IS NOT NULL AND "signedAt" >= ? ORDER BY "signedAt"`,
    clinicId, sinceIso
  );
}

/**
 * How many patients came back (backlog #14): of the patients with a signed
 * visit, how many have more than one. A plain count of what happened — not a
 * rate ClinicOS claims credit for.
 */
export async function patientsWhoCameBack(clinicId: ClinicId): Promise<{ seen: number; again: number }> {
  const r = await q().get<{ seen: number; again: number }>(
    `SELECT CAST(COUNT(*) AS INTEGER) AS seen, CAST(COALESCE(SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END), 0) AS INTEGER) AS again
     FROM (SELECT "patientId", COUNT(*) AS n FROM "Consult"
           WHERE "clinicId" = ? AND "signedAt" IS NOT NULL GROUP BY "patientId") visits`,
    clinicId
  );
  return { seen: r?.seen ?? 0, again: r?.again ?? 0 };
}

/** Minutes of documentation saved, at a conservative 4 minutes per signed,
 *  AI-drafted note. Deliberately conservative: this number goes in front of
 *  doctors, and one they can disbelieve costs you more than a smaller one they
 *  accept. */
export async function minutesSaved(clinicId: ClinicId): Promise<number> {
  return (await countDraftedSignedConsults(clinicId)) * 4;
}

// ---------------------------------------------------------------- deletion
export type DeletionReport = {
  patientName: string;
  consultsDeleted: number;
  editsDeleted: number;
  audioPaths: string[];
};

/**
 * Permanently delete a patient and everything attached to them.
 *
 * Consults, edits, queue entries and any recording held in the database
 * cascade via foreign keys. Audio paths are returned so the caller can remove
 * recordings kept on disk — the database cannot delete a file.
 *
 * There is no undo. The route that calls this requires the caller to retype
 * the patient's name first, and that check exists for a reason.
 */
export async function deletePatientCascade(clinicId: ClinicId, id: string): Promise<DeletionReport | null> {
  const patient = await getPatient(clinicId, id);
  if (!patient) return null;

  const consults = await q().all<{ id: string; audioPath: string | null }>(
    `SELECT id, "audioPath" FROM "Consult" WHERE "clinicId" = ? AND "patientId" = ?`,
    clinicId, id
  );
  const audioPaths = consults.map((c) => c.audioPath).filter(Boolean) as string[];

  let editsDeleted = 0;
  for (const c of consults) editsDeleted += await countEdits(clinicId, c.id);

  // cascades to Consult -> Edit, QueueEntry
  await q().run(`DELETE FROM "Patient" WHERE id = ? AND "clinicId" = ?`, id, clinicId);

  return {
    patientName: patient.name,
    consultsDeleted: consults.length,
    editsDeleted,
    audioPaths,
  };
}

export function countConsultsForPatient(clinicId: ClinicId, patientId: string): Promise<number> {
  return count(
    `SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE "clinicId" = ? AND "patientId" = ?`,
    clinicId, patientId
  );
}

/** Everything about one patient, for export before deletion. */
export async function exportPatient(clinicId: ClinicId, id: string) {
  const patient = await getPatient(clinicId, id);
  if (!patient) return null;
  const consults = await q().all<Consult>(
    `SELECT * FROM "Consult" WHERE "clinicId" = ? AND "patientId" = ? ORDER BY "createdAt"`,
    clinicId, id
  );
  const withEdits = [];
  for (const c of consults) withEdits.push({ ...c, audioPath: undefined, edits: await editsFor(clinicId, c.id) });
  return {
    exportedAt: now(),
    patient,
    consults: withEdits,
    bills: exportBills(await billsForPatient(clinicId, id)),
    recalls: await recallsForPatient(clinicId, id),
  };
}

export async function databaseStats(clinicId: ClinicId, numbers?: ClinicNumbers) {
  const n = numbers ?? (await clinicNumbers(clinicId));
  return {
    patients: n.patients,
    consults: n.consults,
    signed: n.signed,
    edits: n.edits,
    path: BACKEND === "postgres" ? "Online database (Postgres, Mumbai)" : DB_PATH,
  };
}

// ------------------------------------------------------- crash recovery
/**
 * Recovery is the whole point of this section.
 *
 * A consultation can be interrupted at any moment — the tab closes, the laptop
 * sleeps, the power goes. Whatever the doctor had said or typed up to that
 * instant must already be stored. Losing one consultation in front of a
 * waiting patient is the failure that ends a pilot.
 */

export async function markRecordingStarted(clinicId: ClinicId, id: string) {
  await q().run(
    `UPDATE "Consult" SET "recordingStartedAt" = ?, "recordingEndedAt" = NULL WHERE id = ? AND "clinicId" = ?`,
    now(), id, clinicId
  );
}

/** Close a part of the recording. `seconds` is that part alone, so it adds to
 *  what is already there: a consultation recorded in two goes lasted both. */
export async function markRecordingEnded(clinicId: ClinicId, id: string, seconds: number | null, bytes: number | null) {
  await q().run(
    `UPDATE "Consult" SET "recordingEndedAt" = ?, "audioSeconds" = COALESCE("audioSeconds", 0) + ?, "audioBytes" = ?
     WHERE id = ? AND "clinicId" = ?`,
    now(), seconds ?? 0, bytes, id, clinicId
  );
}

export async function setAudioPath(clinicId: ClinicId, id: string, audioPath: string) {
  await q().run(`UPDATE "Consult" SET "audioPath" = ? WHERE id = ? AND "clinicId" = ?`, audioPath, id, clinicId);
}

/** Debounced autosave from the editor. Never touches draftJson — the AI's
 *  original must stay intact so the edit diff at signing is still honest. */
export async function saveWorking(clinicId: ClinicId, id: string, transcript: string | null, workingJson: string | null) {
  const parts: string[] = [`"workingSavedAt" = ?`];
  const args: (string | null)[] = [now()];
  if (transcript !== null) { parts.push("transcript = ?"); args.push(transcript); }
  if (workingJson !== null) { parts.push(`"workingJson" = ?`); args.push(workingJson); }
  args.push(id, clinicId);
  await q().run(`UPDATE "Consult" SET ${parts.join(", ")} WHERE id = ? AND "clinicId" = ?`, ...args);
}

export type UnfinishedConsult = ConsultWithPatient & { reason: string };

/** Consultations that were started and never signed. Surfaced on Today so an
 *  interrupted visit cannot silently disappear. */
export async function unfinishedConsults(clinicId: ClinicId): Promise<UnfinishedConsult[]> {
  const rows = await q().all<JoinedRow>(
    `SELECT c.*, ${PATIENT_JOIN} FROM "Consult" c JOIN "Patient" p ON p.id = c."patientId"
     WHERE c."clinicId" = ? AND c."signedAt" IS NULL
       AND (c."audioPath" IS NOT NULL OR c.transcript IS NOT NULL
            OR c."workingJson" IS NOT NULL OR c."draftJson" IS NOT NULL)
     ORDER BY c."createdAt" DESC LIMIT 20`,
    clinicId
  );

  const out: UnfinishedConsult[] = [];
  for (const row of rows) {
    const c = withPatient(row);
    let reason = "Started but not signed";
    if (c.recordingStartedAt && !c.recordingEndedAt) reason = "Recording was interrupted";
    else if (c.workingJson) reason = "Unsigned note with your edits";
    else if (c.draftJson) reason = "Note drafted, not signed";
    else if (c.transcript) reason = "Transcribed, no note yet";
    else if (c.audioPath) reason = "Audio captured, not transcribed";
    out.push({ ...c, reason });
  }
  return out;
}

// ------------------------------------------------------------------- queue
export type QueueStatus = "waiting" | "with-doctor" | "done" | "left";

export type QueueEntry = {
  id: string;
  clinicId: string;
  patientId: string;
  day: string;
  token: number;
  status: QueueStatus;
  addedBy: string | null;
  consultId: string | null;
  calledBy: string | null;
  addedAt: string;
  calledAt: string | null;
  doneAt: string | null;
};

/** A list row with just enough about the patient to call them in. Nothing
 *  clinical: the front desk reads this. */
export type QueueRow = QueueEntry & {
  patientName: string;
  patientAge: number | null;
  patientSex: string | null;
  patientPhone: string | null;
  calledByName: string | null;
};

export function getQueueEntry(clinicId: ClinicId, id: string): Promise<QueueEntry | undefined> {
  return q().get<QueueEntry>(`SELECT * FROM "QueueEntry" WHERE id = ? AND "clinicId" = ?`, id, clinicId);
}

export function todaysQueue(clinicId: ClinicId): Promise<QueueRow[]> {
  return q().all<QueueRow>(
    `SELECT qe.*, p.name AS "patientName", p.age AS "patientAge", p.sex AS "patientSex", p.phone AS "patientPhone",
            d.name AS "calledByName"
     FROM "QueueEntry" qe
     JOIN "Patient" p ON p.id = qe."patientId"
     LEFT JOIN "User" d ON d.id = qe."calledBy"
     WHERE qe."clinicId" = ? AND qe.day = ?
     ORDER BY qe.token`,
    clinicId, localDay()
  );
}

/**
 * Put a patient on today's list. A patient already waiting or with a doctor
 * keeps their token rather than getting a second one, so a receptionist who
 * adds someone twice does not make them queue twice.
 *
 * Two desks adding at the same instant can both read the same highest token.
 * SQLite never sees that, because its transactions run one at a time; Postgres
 * does, and the unique index on (clinicId, day, token) turns the loser's insert
 * into an error. That is the signal to read again and take the next number.
 */
export async function addToQueue(
  clinicId: ClinicId,
  patientId: string,
  addedBy: string | null
): Promise<{ entry: QueueEntry; alreadyQueued: boolean }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tx(async () => {
        const day = localDay();
        const existing = await q().get<QueueEntry>(
          `SELECT * FROM "QueueEntry"
           WHERE "clinicId" = ? AND day = ? AND "patientId" = ? AND status IN ('waiting', 'with-doctor')`,
          clinicId, day, patientId
        );
        if (existing) return { entry: existing, alreadyQueued: true };

        const token = (await q().get<{ t: number }>(
          `SELECT CAST(COALESCE(MAX(token), 0) + 1 AS INTEGER) AS t FROM "QueueEntry" WHERE "clinicId" = ? AND day = ?`,
          clinicId, day
        ))!.t;
        const id = newId();
        await q().run(
          `INSERT INTO "QueueEntry" (id, "clinicId", "patientId", day, token, status, "addedBy", "addedAt")
           VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?)`,
          id, clinicId, patientId, day, token, addedBy, now()
        );
        return { entry: (await getQueueEntry(clinicId, id))!, alreadyQueued: false };
      });
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= 20) throw e;
    }
  }
}

/**
 * A doctor calls a waiting patient in. Opens a consultation (or returns the one
 * this doctor already opened) and marks the entry "with doctor", so two doctors
 * pressing the button together cannot both take the same patient. Returns null
 * when the patient is no longer theirs to call.
 *
 * The update only succeeds while the entry is still waiting. Under Postgres the
 * second doctor's update waits for the first to commit and then matches no
 * row, so their transaction — including the consultation it opened — is rolled
 * back.
 */
class TakenByAnother extends Error {}

export async function startQueueEntry(clinicId: ClinicId, id: string, doctorId: string): Promise<QueueEntry | null> {
  try {
    return await tx(async () => {
      const e = await getQueueEntry(clinicId, id);
      if (!e || e.day !== localDay()) return null;
      if (e.status === "with-doctor" && e.calledBy === doctorId && e.consultId) return e;
      if (e.status !== "waiting") return null;

      let consultId = e.consultId;
      const existing = consultId ? await getConsult(clinicId, consultId) : undefined;
      if (!existing || existing.signedAt) consultId = (await createConsult(clinicId, e.patientId, doctorId)).id;

      const { changes } = await q().run(
        `UPDATE "QueueEntry" SET status = 'with-doctor', "consultId" = ?, "calledBy" = ?, "calledAt" = ?
         WHERE id = ? AND "clinicId" = ? AND status = 'waiting'`,
        consultId, doctorId, now(), id, clinicId
      );
      if (changes !== 1) throw new TakenByAnother();
      return (await getQueueEntry(clinicId, id))!;
    });
  } catch (e) {
    if (!(e instanceof TakenByAnother)) throw e;
    // Pressed twice at once by the same doctor: the other press won, and it is theirs.
    const after = await getQueueEntry(clinicId, id);
    return after && after.status === "with-doctor" && after.calledBy === doctorId && after.consultId ? after : null;
  }
}

/** The patient went home without being seen. Only a waiting entry can leave. */
export async function markQueueLeft(clinicId: ClinicId, id: string): Promise<boolean> {
  const { changes } = await q().run(
    `UPDATE "QueueEntry" SET status = 'left', "doneAt" = ? WHERE id = ? AND "clinicId" = ? AND status = 'waiting'`,
    now(), id, clinicId
  );
  return changes === 1;
}

/** Signing the consultation is what marks the patient as seen. */
export async function markQueueDoneForConsult(clinicId: ClinicId, consultId: string) {
  await q().run(
    `UPDATE "QueueEntry" SET status = 'done', "doneAt" = ?
     WHERE "clinicId" = ? AND "consultId" = ? AND status = 'with-doctor'`,
    now(), clinicId, consultId
  );
}

// ------------------------------------------------------------------- bills
/**
 * Bills and receipts (backlog #12). What the desk typed and what was paid —
 * never anything clinical. Amounts are whole paise (money.ts).
 *
 * A receipt number is given at payment, never at billing, so the numbers on
 * paper run in the order money was taken. Online they are plain (0042); a
 * clinic computer puts its own tag in front (KTR-0042), so a clinic computer
 * and its clinic online, or two clinic computers, can never print the same
 * one. A paid bill is never changed or deleted: it can only be cancelled, by
 * someone who manages the clinic, with a reason.
 */
export type Bill = {
  id: string;
  clinicId: string;
  patientId: string;
  itemsJson: string;
  totalPaise: number;
  day: string;
  receiptNo: string | null;
  receiptPrefix: string | null;
  receiptSeq: number | null;
  paidAt: string | null;
  paidDay: string | null;
  method: string | null;
  receivedBy: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
};

/** A bill with the names needed to show and print it. Nothing clinical: the
 *  front desk reads this. */
export type BillRow = Bill & {
  patientName: string;
  patientPhone: string | null;
  patientAge: number | null;
  patientSex: string | null;
  receivedByName: string | null;
  voidedByName: string | null;
};

const BILL_SELECT = `
  SELECT b.*, p.name AS "patientName", p.phone AS "patientPhone", p.age AS "patientAge", p.sex AS "patientSex",
         r.name AS "receivedByName", v.name AS "voidedByName"
  FROM "Bill" b
  JOIN "Patient" p ON p.id = b."patientId"
  LEFT JOIN "User" r ON r.id = b."receivedBy"
  LEFT JOIN "User" v ON v.id = b."voidedBy"`;

export function getBill(clinicId: ClinicId, id: string): Promise<BillRow | undefined> {
  return q().get<BillRow>(`${BILL_SELECT} WHERE b.id = ? AND b."clinicId" = ?`, id, clinicId);
}

export async function createBill(
  clinicId: ClinicId,
  patientId: string,
  items: { label: string; amount: number }[],
  createdBy: string | null
): Promise<Bill> {
  const id = newId();
  const at = now();
  await q().run(
    `INSERT INTO "Bill" (id, "clinicId", "patientId", "itemsJson", "totalPaise", day, "createdBy", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, clinicId, patientId, JSON.stringify(items), items.reduce((s, i) => s + i.amount, 0), localDay(), createdBy, at, at
  );
  return (await q().get<Bill>(`SELECT * FROM "Bill" WHERE id = ? AND "clinicId" = ?`, id, clinicId))!;
}

export function formatReceiptNo(prefix: string | null, seq: number): string {
  const n = String(seq).padStart(4, "0");
  return prefix ? `${prefix}-${n}` : n;
}

// Consonants only, and never L: a tag can spell no word, and none of its
// letters can be misread as 1, 0 or another letter on a printed receipt.
const TAG_LETTERS = "BCDFGHJKMNPQRSTVWXZ";

/**
 * What goes in front of this copy's receipt numbers: nothing online, and on a
 * clinic computer a three-letter tag made the first time it takes a payment.
 * The tag is kept in a setting that never travels, so each computer keeps its
 * own for good, connected or not, and avoids any tag already on this clinic's
 * receipts from another computer.
 */
async function receiptPrefix(clinicId: ClinicId): Promise<string> {
  if (BACKEND === "postgres") return "";
  const kept = await getSetting(clinicId, "receipt_tag");
  if (kept) return kept;
  const taken = new Set(
    (await q().all<{ p: string | null }>(`SELECT DISTINCT "receiptPrefix" AS p FROM "Bill" WHERE "clinicId" = ?`, clinicId)).map((r) => r.p)
  );
  let tag = "";
  do {
    tag = "";
    for (const b of randomBytes(3)) tag += TAG_LETTERS[b % TAG_LETTERS.length];
  } while (taken.has(tag));
  await q().run(
    `INSERT INTO "ClinicSetting" ("clinicId", key, value) VALUES (?, 'receipt_tag', ?) ON CONFLICT DO NOTHING`,
    clinicId, tag
  );
  return (await getSetting(clinicId, "receipt_tag")) ?? tag;
}

class BillTaken extends Error {}

export type PayOutcome =
  | { state: "paid"; bill: BillRow }
  | { state: "already"; bill: BillRow }
  | { state: "cancelled"; bill: BillRow };

/**
 * Take payment for a bill and give it the next receipt number.
 *
 * Two desks paying two bills at the same instant on Postgres can both read the
 * same highest number; the unique index refuses the second, which then reads
 * again and takes the next — the same shape as addToQueue. Two desks paying
 * the same bill: the second finds it already paid and is told so.
 */
export async function payBill(clinicId: ClinicId, id: string, method: string, receivedBy: string | null): Promise<PayOutcome | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tx(async (): Promise<PayOutcome | null> => {
        const bill = await getBill(clinicId, id);
        if (!bill) return null;
        if (bill.voidedAt) return { state: "cancelled", bill };
        if (bill.paidAt) return { state: "already", bill };

        const prefix = await receiptPrefix(clinicId);
        const seq = (await q().get<{ n: number }>(
          `SELECT CAST(COALESCE(MAX("receiptSeq"), 0) + 1 AS INTEGER) AS n FROM "Bill"
           WHERE "clinicId" = ? AND COALESCE("receiptPrefix", '') = ? AND "receiptSeq" IS NOT NULL`,
          clinicId, prefix
        ))!.n;
        const { changes } = await q().run(
          `UPDATE "Bill" SET "receiptNo" = ?, "receiptPrefix" = ?, "receiptSeq" = ?, "paidAt" = ?, "paidDay" = ?, method = ?, "receivedBy" = ?
           WHERE id = ? AND "clinicId" = ? AND "paidAt" IS NULL AND "voidedAt" IS NULL`,
          formatReceiptNo(prefix, seq), prefix, seq, now(), localDay(), method, receivedBy, id, clinicId
        );
        if (changes !== 1) throw new BillTaken();
        return { state: "paid", bill: (await getBill(clinicId, id))! };
      });
    } catch (e) {
      if (e instanceof BillTaken) {
        const bill = await getBill(clinicId, id);
        if (!bill) return null;
        return bill.voidedAt ? { state: "cancelled", bill } : { state: "already", bill };
      }
      if (!isUniqueViolation(e) || attempt >= 20) throw e;
    }
  }
}

/** Cancel a bill, paid or not. It stays on record, marked cancelled, and no
 *  longer counts towards anything collected or owed. */
export async function voidBill(clinicId: ClinicId, id: string, by: string, reason: string): Promise<boolean> {
  const { changes } = await q().run(
    `UPDATE "Bill" SET "voidedAt" = ?, "voidedBy" = ?, "voidReason" = ? WHERE id = ? AND "clinicId" = ? AND "voidedAt" IS NULL`,
    now(), by, reason, id, clinicId
  );
  return changes === 1;
}

/** Bills not yet paid or cancelled, from any day: money still owed. */
export function unpaidBills(clinicId: ClinicId, limit = 100): Promise<BillRow[]> {
  return q().all<BillRow>(
    `${BILL_SELECT} WHERE b."clinicId" = ? AND b."paidAt" IS NULL AND b."voidedAt" IS NULL ORDER BY b."createdAt" DESC LIMIT ?`,
    clinicId, limit
  );
}

/** Bills paid on one of the clinic's days, cancelled ones included (shown struck through). */
export function billsPaidOn(clinicId: ClinicId, day: string): Promise<BillRow[]> {
  return q().all<BillRow>(
    `${BILL_SELECT} WHERE b."clinicId" = ? AND b."paidDay" = ? ORDER BY b."paidAt" DESC`,
    clinicId, day
  );
}

export function billsForPatient(clinicId: ClinicId, patientId: string): Promise<Bill[]> {
  return q().all<Bill>(
    `SELECT * FROM "Bill" WHERE "clinicId" = ? AND "patientId" = ? ORDER BY "createdAt"`,
    clinicId, patientId
  );
}

export type DayTakings = { total: number; count: number; byMethod: Record<string, number> };

/** What was collected on one of the clinic's days, by method: the drawer's
 *  cash, and what came by UPI or card. Cancelled bills do not count. */
export async function takingsOn(clinicId: ClinicId, day: string): Promise<DayTakings> {
  const rows = await q().all<{ method: string | null; total: number; n: number }>(
    `SELECT method, CAST(SUM("totalPaise") AS INTEGER) AS total, CAST(COUNT(*) AS INTEGER) AS n FROM "Bill"
     WHERE "clinicId" = ? AND "paidDay" = ? AND "voidedAt" IS NULL GROUP BY method`,
    clinicId, day
  );
  const byMethod: Record<string, number> = {};
  for (const r of rows) byMethod[r.method ?? "other"] = (byMethod[r.method ?? "other"] ?? 0) + r.total;
  return { total: rows.reduce((s, r) => s + r.total, 0), count: rows.reduce((s, r) => s + r.n, 0), byMethod };
}

/** Everything still owed, and on how many bills. */
export async function owedTotal(clinicId: ClinicId): Promise<{ total: number; count: number }> {
  const r = await q().get<{ total: number; n: number }>(
    `SELECT CAST(COALESCE(SUM("totalPaise"), 0) AS INTEGER) AS total, CAST(COUNT(*) AS INTEGER) AS n FROM "Bill"
     WHERE "clinicId" = ? AND "paidAt" IS NULL AND "voidedAt" IS NULL`,
    clinicId
  );
  return { total: r?.total ?? 0, count: r?.n ?? 0 };
}

/** Collected per day since a day, for Clinic admin: plain sums, nothing else. */
export function collectedSince(clinicId: ClinicId, sinceDay: string): Promise<{ day: string; total: number; count: number }[]> {
  return q().all(
    `SELECT "paidDay" AS day, CAST(SUM("totalPaise") AS INTEGER) AS total, CAST(COUNT(*) AS INTEGER) AS count FROM "Bill"
     WHERE "clinicId" = ? AND "paidDay" >= ? AND "voidedAt" IS NULL GROUP BY "paidDay" ORDER BY "paidDay"`,
    clinicId, sinceDay
  );
}

// ---------------------------------------------------------------- recalls
/**
 * Follow-up recall (backlog #10). A signed visit whose date to come back has
 * arrived, for a patient who has not been back since, is shown to the desk
 * until someone messages the patient or marks it not needed.
 *
 * Only the date, the patient and the doctor: never a diagnosis. The front desk
 * reads this, and a reminder must not tell anyone who sees the patient's phone
 * what they were treated for.
 */
export type FollowUpDue = {
  consultId: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  followUpOn: string;
  signedAt: string;
  doctorName: string | null;
};

/** How far back an unanswered follow-up stays on the list. */
export const RECALL_DAYS = 60;

/** Due between fromDay and today, both the clinic's days, oldest first. "Back
 *  since" means a later visit was opened, or they were put on the day's list. */
export const FOLLOW_UPS_SHOWN = 200;

export function followUpsDue(clinicId: ClinicId, today: string, fromDay: string, limit = FOLLOW_UPS_SHOWN): Promise<FollowUpDue[]> {
  return q().all<FollowUpDue>(
    `SELECT c.id AS "consultId", c."patientId", p.name AS "patientName", p.phone AS "patientPhone",
            c."followUpOn", c."signedAt", d.name AS "doctorName"
     FROM "Consult" c
     JOIN "Patient" p ON p.id = c."patientId"
     LEFT JOIN "User" d ON d.id = c."doctorId"
     WHERE c."clinicId" = ? AND c."signedAt" IS NOT NULL AND c."followUpOn" IS NOT NULL
       AND c."followUpOn" <= ? AND c."followUpOn" >= ?
       AND NOT EXISTS (SELECT 1 FROM "Recall" r WHERE r."clinicId" = c."clinicId" AND r."consultId" = c.id)
       AND NOT EXISTS (SELECT 1 FROM "Consult" later
                       WHERE later."clinicId" = c."clinicId" AND later."patientId" = c."patientId" AND later."createdAt" > c."createdAt")
       AND NOT EXISTS (SELECT 1 FROM "QueueEntry" qe
                       WHERE qe."clinicId" = c."clinicId" AND qe."patientId" = c."patientId"
                         AND qe."addedAt" > c."signedAt" AND qe.status <> 'left')
     ORDER BY c."followUpOn", p.name LIMIT ?`,
    clinicId, today, fromDay, limit
  );
}

export type RecallAction = "messaged" | "dismissed";

/** What the desk did about a due follow-up. One row per visit: its id comes
 *  from the visit's, so a second tap, or the same visit dealt with on another
 *  copy, updates it rather than adding another. */
export async function recordRecall(
  clinicId: ClinicId,
  consultId: string,
  action: RecallAction,
  by: string | null
): Promise<boolean> {
  const c = await q().get<{ patientId: string }>(
    `SELECT "patientId" FROM "Consult" WHERE id = ? AND "clinicId" = ? AND "signedAt" IS NOT NULL`,
    consultId, clinicId
  );
  if (!c) return false;
  const at = now();
  await q().run(
    `INSERT INTO "Recall" (id, "clinicId", "consultId", "patientId", action, at, "byUser", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET action = excluded.action, at = excluded.at, "byUser" = excluded."byUser",
       "updatedAt" = excluded."updatedAt"
     WHERE "Recall"."clinicId" = excluded."clinicId"`,
    `rc-${consultId}`, clinicId, consultId, c.patientId, action, at, by, at
  );
  return true;
}

function recallsForPatient(clinicId: ClinicId, patientId: string) {
  return q().all(
    `SELECT "consultId", action, at FROM "Recall" WHERE "clinicId" = ? AND "patientId" = ? ORDER BY at`,
    clinicId, patientId
  );
}

// ---------------------------------------------------------------- accounts
export type Role = "doctor" | "staff" | "admin";

export type UserRow = {
  id: string;
  clinicId: string;
  name: string;
  username: string;
  role: Role;
  isAdmin: number;
  passwordHash: string;
  qualification: string | null;
  regNo: string | null;
  active: number;
  mustChangePassword: number;
  createdAt: string;
  lastLoginAt: string | null;
};

/** A user row that is safe to hand to a page: no password hash. */
export type PublicUser = Omit<UserRow, "passwordHash">;

const PUBLIC_USER_COLUMNS =
  `id, "clinicId", name, username, role, "isAdmin", qualification, "regNo", active, "mustChangePassword", "createdAt", "lastLoginAt"`;

/** Admin access follows from the role for staff and admins; only a doctor's is
 *  a separate choice. Normalising here means no row can say "staff, admin". */
function adminFlag(role: Role, isAdmin: boolean): number {
  if (role === "admin") return 1;
  if (role === "staff") return 0;
  return isAdmin ? 1 : 0;
}

export function countUsers(clinicId: ClinicId): Promise<number> {
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "User" WHERE "clinicId" = ?`, clinicId);
}

/** People who can still manage the clinic. Guards against locking everyone out. */
export function countActiveAdmins(clinicId: ClinicId): Promise<number> {
  return count(
    `SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "User" WHERE "clinicId" = ? AND active = 1 AND "isAdmin" = 1`,
    clinicId
  );
}

export function getUserRow(clinicId: ClinicId, id: string): Promise<UserRow | undefined> {
  return q().get<UserRow>(`SELECT * FROM "User" WHERE id = ? AND "clinicId" = ?`, id, clinicId);
}

export function getUserPublic(clinicId: ClinicId, id: string): Promise<PublicUser | undefined> {
  return q().get<PublicUser>(`SELECT ${PUBLIC_USER_COLUMNS} FROM "User" WHERE id = ? AND "clinicId" = ?`, id, clinicId);
}

/** Usernames never differ only by case, within a clinic. SQLite's column
 *  ignores case on its own; LOWER() says the same thing to Postgres. */
export function getUserByUsername(clinicId: ClinicId, username: string): Promise<UserRow | undefined> {
  return q().get<UserRow>(
    `SELECT * FROM "User" WHERE "clinicId" = ? AND LOWER(username) = LOWER(?)`,
    clinicId, username
  );
}

export function listUsers(clinicId: ClinicId): Promise<PublicUser[]> {
  return q().all<PublicUser>(
    `SELECT ${PUBLIC_USER_COLUMNS} FROM "User" WHERE "clinicId" = ? ORDER BY active DESC, LOWER(name)`,
    clinicId
  );
}

export type NewUser = {
  name: string;
  username: string;
  role: Role;
  isAdmin: boolean;
  passwordHash: string;
  qualification?: string | null;
  regNo?: string | null;
  mustChangePassword: boolean;
};

export async function createUser(clinicId: ClinicId, u: NewUser): Promise<UserRow> {
  const id = newId();
  await q().run(
    `INSERT INTO "User" (id, "clinicId", name, username, role, "isAdmin", "passwordHash", qualification, "regNo",
                         active, "mustChangePassword", "createdAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id,
    clinicId,
    u.name,
    u.username,
    u.role,
    adminFlag(u.role, u.isAdmin),
    u.passwordHash,
    u.qualification || null,
    u.regNo || null,
    u.mustChangePassword ? 1 : 0,
    now()
  );
  return (await getUserRow(clinicId, id))!;
}

/**
 * The first account of a clinic, created from /setup. Two browsers submitting
 * setup at the same moment must not both become the owner.
 *
 * Checking that there are no accounts is not enough on Postgres, where both
 * transactions can see an empty table. So setup also claims a row with a fixed
 * key: the second insert waits for the first transaction, then conflicts and
 * inserts nothing, and that transaction gives up.
 */
export async function createFirstAccount(clinicId: ClinicId, u: NewUser, clinicName: string): Promise<UserRow | null> {
  return tx(async () => {
    if ((await countUsers(clinicId)) > 0) return null;
    const claimed = await q().run(
      `INSERT INTO "ClinicSetting" ("clinicId", key, value) VALUES (?, 'setup_claimed_at', ?) ON CONFLICT DO NOTHING`,
      clinicId, now()
    );
    if (claimed.changes !== 1 && (await countUsers(clinicId)) > 0) return null;
    const user = await createUser(clinicId, u);
    await setSettings(clinicId, { clinic_name: clinicName });
    // The code that opened setup has done its job; it opens nothing again.
    await q().run(`UPDATE "Tenant" SET "setupCodeHash" = NULL, "updatedAt" = ? WHERE id = ?`, now(), clinicId);
    return user;
  });
}

export type UserPatch = {
  name?: string;
  role?: Role;
  isAdmin?: boolean;
  qualification?: string | null;
  regNo?: string | null;
  active?: boolean;
};

export async function updateUser(clinicId: ClinicId, id: string, patch: UserPatch) {
  const current = await getUserRow(clinicId, id);
  if (!current) return;
  const role = patch.role ?? current.role;
  const isAdmin = adminFlag(role, patch.isAdmin ?? !!current.isAdmin);
  await q().run(
    `UPDATE "User" SET name = ?, role = ?, "isAdmin" = ?, qualification = ?, "regNo" = ?, active = ?
     WHERE id = ? AND "clinicId" = ?`,
    patch.name ?? current.name,
    role,
    isAdmin,
    patch.qualification !== undefined ? patch.qualification : current.qualification,
    patch.regNo !== undefined ? patch.regNo : current.regNo,
    patch.active !== undefined ? (patch.active ? 1 : 0) : current.active,
    id,
    clinicId
  );
}

export async function setUserPassword(clinicId: ClinicId, id: string, passwordHash: string, mustChange: boolean) {
  await q().run(
    `UPDATE "User" SET "passwordHash" = ?, "mustChangePassword" = ? WHERE id = ? AND "clinicId" = ?`,
    passwordHash, mustChange ? 1 : 0, id, clinicId
  );
}

export async function touchLogin(clinicId: ClinicId, id: string) {
  await q().run(`UPDATE "User" SET "lastLoginAt" = ? WHERE id = ? AND "clinicId" = ?`, now(), id, clinicId);
}

/** Put an account back exactly as it was, hash included. Used after restoring a
 *  backup that predates accounts, so the person restoring is not locked out. */
export async function reinsertUserRow(row: UserRow) {
  await q().run(
    `INSERT INTO "User" (id, "clinicId", name, username, role, "isAdmin", "passwordHash", qualification, "regNo",
                         active, "mustChangePassword", "createdAt", "lastLoginAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
    row.id, row.clinicId, row.name, row.username, row.role, row.isAdmin, row.passwordHash, row.qualification,
    row.regNo, row.active, row.mustChangePassword, row.createdAt, row.lastLoginAt
  );
}

// ---------------------------------------------------------------- sessions
export type SessionJoin = {
  tokenHash: string;
  expiresAt: string;
  lastSeenAt: string;
  id: string;
  clinicId: string;
  clinicStatus: TenantStatus;
  name: string;
  username: string;
  role: Role;
  isAdmin: number;
  qualification: string | null;
  regNo: string | null;
  mustChangePassword: number;
};

export async function insertSession(tokenHash: string, userId: string, expiresAt: string) {
  const t = now();
  await q().run(
    `INSERT INTO "Session" ("tokenHash", "userId", "createdAt", "expiresAt", "lastSeenAt") VALUES (?, ?, ?, ?, ?)`,
    tokenHash, userId, t, expiresAt, t
  );
}

/** A live session, its account and the account's clinic. Deactivated accounts
 *  and expired sessions simply do not match, so there is no separate check to
 *  forget. */
export function getSessionUser(tokenHash: string): Promise<SessionJoin | undefined> {
  return q().get<SessionJoin>(
    `SELECT s."tokenHash", s."expiresAt", s."lastSeenAt",
            u.id, u."clinicId", t.status AS "clinicStatus", u.name, u.username, u.role, u."isAdmin",
            u.qualification, u."regNo", u."mustChangePassword"
     FROM "Session" s
     JOIN "User" u ON u.id = s."userId"
     JOIN "Tenant" t ON t.id = u."clinicId"
     WHERE s."tokenHash" = ? AND s."expiresAt" > ? AND u.active = 1`,
    tokenHash, now()
  );
}

export async function touchSession(tokenHash: string, expiresAt: string) {
  await q().run(`UPDATE "Session" SET "lastSeenAt" = ?, "expiresAt" = ? WHERE "tokenHash" = ?`, now(), expiresAt, tokenHash);
}

export async function deleteSession(tokenHash: string) {
  await q().run(`DELETE FROM "Session" WHERE "tokenHash" = ?`, tokenHash);
}

/** Account ids are unique across every clinic, so the id alone is enough. */
export async function deleteSessionsForUser(userId: string, exceptTokenHash: string | null = null) {
  if (exceptTokenHash) {
    await q().run(`DELETE FROM "Session" WHERE "userId" = ? AND "tokenHash" != ?`, userId, exceptTokenHash);
  } else {
    await q().run(`DELETE FROM "Session" WHERE "userId" = ?`, userId);
  }
}

export async function pruneExpiredSessions() {
  await q().run(`DELETE FROM "Session" WHERE "expiresAt" <= ?`, now());
}

// ------------------------------------------------------------------- audit
export type AuditActor = { id: string; name: string } | null;

export type AuditEvent = {
  id: string;
  clinicId: string | null;
  userId: string | null;
  userName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  at: string;
};

/** clinicId is null only for events about the platform itself, such as an
 *  operator signing in; those never appear in any clinic's log. */
export async function recordAudit(
  clinicId: ClinicId | null,
  actor: AuditActor,
  action: string,
  targetType: string | null = null,
  targetId: string | null = null,
  detail: string | null = null
) {
  await q().run(
    `INSERT INTO "AuditEvent" (id, "clinicId", "userId", "userName", action, "targetType", "targetId", detail, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(), clinicId, actor?.id ?? null, actor?.name ?? null, action, targetType, targetId, detail, now()
  );
}

export function listAudit(clinicId: ClinicId, limit = 300): Promise<AuditEvent[]> {
  return q().all<AuditEvent>(
    `SELECT * FROM "AuditEvent" WHERE "clinicId" = ? ORDER BY at DESC LIMIT ?`,
    clinicId, limit
  );
}

/**
 * Wrong passwords for one username in one clinic since a moment, read from the
 * activity log.
 *
 * The count used to live in the server's memory, which was fine on one laptop.
 * Online there are many short-lived copies of the server, each with its own
 * empty memory, so a guesser would never be slowed. The log is shared by all
 * of them, and every failed sign-in is already written there.
 */
export function failedLoginsSince(clinicId: ClinicId | null, username: string, sinceIso: string, action = "login_failed"): Promise<number> {
  return clinicId
    ? count(
        `SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "AuditEvent" WHERE "clinicId" = ? AND action = ? AND detail = ? AND at > ?`,
        clinicId, action, `username: ${username}`, sinceIso
      )
    : count(
        `SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "AuditEvent" WHERE "clinicId" IS NULL AND action = ? AND detail = ? AND at > ?`,
        action, `username: ${username}`, sinceIso
      );
}

// -------------------------------------------------------------- favourites
/**
 * A doctor's own saved prescriptions. Each doctor sees and changes only their
 * own: every query here is scoped by userId, and the routes pass the signed-in
 * account's id, never one from the request. An account belongs to one clinic,
 * so that scopes them to the clinic as well.
 */
export type Favourite = {
  id: string;
  clinicId: string;
  userId: string;
  name: string;
  noteJson: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
};

/** What the browser gets: the plan, re-read through planOf so only its own
 *  fields ever leave the server. */
export type FavouriteView = { id: string; name: string; plan: Plan; useCount: number };

export function favouriteView(f: Favourite): FavouriteView {
  return { id: f.id, name: f.name, plan: planOf(JSON.parse(f.noteJson)), useCount: f.useCount };
}

/** Enough for anyone's top twenty several times over; stops a runaway script. */
export const MAX_FAVOURITES = 200;

export function listFavourites(userId: string): Promise<Favourite[]> {
  // Most used first: the doctor's everyday prescriptions rise to the top.
  return q().all<Favourite>(
    `SELECT * FROM "Favourite" WHERE "userId" = ? ORDER BY "useCount" DESC, LOWER(name)`,
    userId
  );
}

/** Save under a name, replacing that doctor's favourite of the same name
 *  (whatever its case). Returns null when the doctor already has the most.
 *
 *  Two saves of one new name at the same instant (a double tap) both find
 *  nothing and both insert; the unique index refuses the second, and its retry
 *  then finds the first and replaces it — the same shape as addToQueue. */
export async function saveFavourite(
  clinicId: ClinicId,
  userId: string,
  name: string,
  noteJson: string
): Promise<{ favourite: Favourite; replaced: boolean } | null> {
  const find = () =>
    q().get<Favourite>(`SELECT * FROM "Favourite" WHERE "userId" = ? AND LOWER(name) = LOWER(?)`, userId, name);
  for (let attempt = 0; ; attempt++) {
    try {
      return await tx(async () => {
        const existing = await find();
        if (existing) {
          await q().run(
            `UPDATE "Favourite" SET name = ?, "noteJson" = ?, "updatedAt" = ? WHERE id = ?`,
            name, noteJson, now(), existing.id
          );
          return { favourite: (await find())!, replaced: true };
        }
        const mine = await count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Favourite" WHERE "userId" = ?`, userId);
        if (mine >= MAX_FAVOURITES) return null;
        const at = now();
        await q().run(
          `INSERT INTO "Favourite" (id, "clinicId", "userId", name, "noteJson", "useCount", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
          newId(), clinicId, userId, name, noteJson, at, at
        );
        return { favourite: (await find())!, replaced: false };
      });
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= 5) throw e;
    }
  }
}

export async function deleteFavourite(id: string, userId: string): Promise<boolean> {
  return (await q().run(`DELETE FROM "Favourite" WHERE id = ? AND "userId" = ?`, id, userId)).changes > 0;
}

export async function markFavouriteUsed(id: string, userId: string): Promise<boolean> {
  return (
    await q().run(`UPDATE "Favourite" SET "useCount" = "useCount" + 1 WHERE id = ? AND "userId" = ?`, id, userId)
  ).changes > 0;
}

// ---------------------------------------------------------------- settings
export async function getSettings(clinicId: ClinicId): Promise<Record<string, string>> {
  const rows = await q().all<{ key: string; value: string }>(
    `SELECT key, value FROM "ClinicSetting" WHERE "clinicId" = ?`,
    clinicId
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** A few settings by name, without loading the rest: the clinic's logo is a
 *  data URL of up to 100 KB, and Today has no use for it. */
export async function getSomeSettings(clinicId: ClinicId, keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const rows = await q().all<{ key: string; value: string }>(
    `SELECT key, value FROM "ClinicSetting" WHERE "clinicId" = ? AND key IN (${keys.map(() => "?").join(", ")})`,
    clinicId, ...keys
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** One setting, without loading the rest (a clinic's logo is large). */
export async function getSetting(clinicId: ClinicId, key: string): Promise<string | undefined> {
  return (await q().get<{ value: string }>(
    `SELECT value FROM "ClinicSetting" WHERE "clinicId" = ? AND key = ?`,
    clinicId, key
  ))?.value;
}

export async function setSettings(clinicId: ClinicId, values: Record<string, string>) {
  await tx(async () => {
    for (const [k, v] of Object.entries(values)) {
      await q().run(
        `INSERT INTO "ClinicSetting" ("clinicId", key, value) VALUES (?, ?, ?)
         ON CONFLICT ("clinicId", key) DO UPDATE SET value = excluded.value`,
        clinicId, k, v
      );
    }
  });
}

/** A value Varaxis filled in when creating the clinic, dated long ago so that
 *  the clinic's own value wins the first time a clinic computer brings one. */
export async function markSettingSeeded(clinicId: ClinicId, key: string) {
  await q().run(
    `UPDATE "ClinicSetting" SET "updatedAt" = '1970-01-01T00:00:00.000Z' WHERE "clinicId" = ? AND key = ?`,
    clinicId, key
  );
}

// ----------------------------------------------------------------- tenants
/**
 * The clinics themselves. Varaxis creates one when a clinic buys ClinicOS,
 * and sets what its purchase includes. Nothing here reads a clinic's records;
 * the platform console only ever sees counts.
 */
export type TenantStatus = "active" | "suspended";

export type Tenant = {
  id: ClinicId;
  slug: string;
  name: string;
  status: TenantStatus;
  plan: string;
  features: string;
  domain: string | null;
  setupCodeHash: string | null;
  paidUntil: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getTenant(id: string): Promise<Tenant | undefined> {
  return q().get<Tenant>(`SELECT * FROM "Tenant" WHERE id = ?`, id);
}

export function getTenantBySlug(slug: string): Promise<Tenant | undefined> {
  return q().get<Tenant>(`SELECT * FROM "Tenant" WHERE slug = LOWER(?)`, slug.trim());
}

export function getTenantByDomain(host: string): Promise<Tenant | undefined> {
  return q().get<Tenant>(`SELECT * FROM "Tenant" WHERE domain = LOWER(?)`, host.trim());
}

export function listTenants(): Promise<Tenant[]> {
  return q().all<Tenant>(`SELECT * FROM "Tenant" ORDER BY "createdAt"`);
}

export function countTenants(): Promise<number> {
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Tenant"`);
}

export type NewTenant = {
  slug: string;
  name: string;
  plan: string;
  features: string;
  domain: string | null;
  setupCodeHash: string | null;
  paidUntil: string | null;
  notes: string | null;
};

export async function createTenant(t: NewTenant): Promise<Tenant> {
  const id = newId();
  const at = now();
  await q().run(
    `INSERT INTO "Tenant" (id, slug, name, status, plan, features, domain, "setupCodeHash", "paidUntil", notes, "createdAt", "updatedAt")
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, t.slug, t.name, t.plan, t.features, t.domain, t.setupCodeHash, t.paidUntil, t.notes, at, at
  );
  return (await getTenant(id))!;
}

export type TenantPatch = Partial<Pick<Tenant, "slug" | "name" | "status" | "plan" | "features" | "domain" | "paidUntil" | "notes">>;

export async function updateTenant(id: string, patch: TenantPatch) {
  const cur = await getTenant(id);
  if (!cur) return;
  const v = { ...cur, ...patch };
  await q().run(
    `UPDATE "Tenant" SET slug = ?, name = ?, status = ?, plan = ?, features = ?, domain = ?, "paidUntil" = ?, notes = ?, "updatedAt" = ?
     WHERE id = ?`,
    v.slug, v.name, v.status, v.plan, v.features, v.domain, v.paidUntil, v.notes, now(), id
  );
}

export async function setTenantSetupCode(id: string, setupCodeHash: string | null) {
  await q().run(`UPDATE "Tenant" SET "setupCodeHash" = ?, "updatedAt" = ? WHERE id = ?`, setupCodeHash, now(), id);
}

/**
 * Every clinic's counts in one query, for the platform console: with a hundred
 * clinics, asking five questions each is five hundred round trips.
 *
 * Counts and the clinic's own settings row — never a record. The terms are
 * here because a clinic that has not accepted them cannot record, and from the
 * console that looks like a clinic doing nothing.
 */
export type TenantOverview = {
  clinicId: string;
  people: number;
  patients: number;
  signed: number;
  lastActivityAt: string | null;
  terms: string | null;
};

export async function tenantOverviews(): Promise<Map<string, TenantOverview>> {
  const rows = await q().all<TenantOverview>(
    `SELECT t.id AS "clinicId",
            CAST((SELECT COUNT(*) FROM "User" u WHERE u."clinicId" = t.id) AS INTEGER) AS people,
            CAST((SELECT COUNT(*) FROM "Patient" p WHERE p."clinicId" = t.id) AS INTEGER) AS patients,
            CAST((SELECT COUNT(*) FROM "Consult" c WHERE c."clinicId" = t.id AND c."signedAt" IS NOT NULL) AS INTEGER) AS signed,
            (SELECT MAX(a.at) FROM "AuditEvent" a WHERE a."clinicId" = t.id) AS "lastActivityAt",
            (SELECT s.value FROM "ClinicSetting" s WHERE s."clinicId" = t.id AND s.key = 'clinic_terms') AS terms
     FROM "Tenant" t`
  );
  return new Map(rows.map((r) => [r.clinicId, r]));
}

/** How much a clinic uses ClinicOS, as counts only: nothing about any patient. */
export async function tenantUsage(clinicId: ClinicId) {
  return {
    people: await countUsers(clinicId),
    patients: await countPatients(clinicId),
    consults: await count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE "clinicId" = ?`, clinicId),
    signed: await countSignedConsults(clinicId),
    lastActivityAt:
      (await q().get<{ at: string | null }>(`SELECT MAX(at) AS at FROM "AuditEvent" WHERE "clinicId" = ?`, clinicId))?.at ?? null,
  };
}

// --------------------------------------------------------------- operators
/**
 * Varaxis's own accounts, for the platform console. Online only: the tables
 * exist in the online database and nowhere else. Kept apart from clinic
 * accounts so that no role in a clinic can ever become an operator, and no
 * operator can open a clinic's records.
 */
export type OperatorRow = {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  active: number;
  mustChangePassword: number;
  createdAt: string;
  lastLoginAt: string | null;
};

export type OperatorSessionJoin = {
  tokenHash: string;
  expiresAt: string;
  lastSeenAt: string;
  id: string;
  name: string;
  username: string;
  mustChangePassword: number;
};

export function getOperatorByUsername(username: string): Promise<OperatorRow | undefined> {
  return q().get<OperatorRow>(`SELECT * FROM "Operator" WHERE LOWER(username) = LOWER(?)`, username);
}

export function getOperatorRow(id: string): Promise<OperatorRow | undefined> {
  return q().get<OperatorRow>(`SELECT * FROM "Operator" WHERE id = ?`, id);
}

export async function setOperatorPassword(id: string, passwordHash: string, mustChange: boolean) {
  await q().run(
    `UPDATE "Operator" SET "passwordHash" = ?, "mustChangePassword" = ? WHERE id = ?`,
    passwordHash, mustChange ? 1 : 0, id
  );
}

export async function touchOperatorLogin(id: string) {
  await q().run(`UPDATE "Operator" SET "lastLoginAt" = ? WHERE id = ?`, now(), id);
}

export async function insertOperatorSession(tokenHash: string, operatorId: string, expiresAt: string) {
  const t = now();
  await q().run(
    `INSERT INTO "OperatorSession" ("tokenHash", "operatorId", "createdAt", "expiresAt", "lastSeenAt") VALUES (?, ?, ?, ?, ?)`,
    tokenHash, operatorId, t, expiresAt, t
  );
}

export function getOperatorSession(tokenHash: string): Promise<OperatorSessionJoin | undefined> {
  return q().get<OperatorSessionJoin>(
    `SELECT s."tokenHash", s."expiresAt", s."lastSeenAt", o.id, o.name, o.username, o."mustChangePassword"
     FROM "OperatorSession" s JOIN "Operator" o ON o.id = s."operatorId"
     WHERE s."tokenHash" = ? AND s."expiresAt" > ? AND o.active = 1`,
    tokenHash, now()
  );
}

export async function touchOperatorSession(tokenHash: string, expiresAt: string) {
  await q().run(`UPDATE "OperatorSession" SET "lastSeenAt" = ?, "expiresAt" = ? WHERE "tokenHash" = ?`, now(), expiresAt, tokenHash);
}

export async function deleteOperatorSession(tokenHash: string) {
  await q().run(`DELETE FROM "OperatorSession" WHERE "tokenHash" = ?`, tokenHash);
}

export async function deleteOperatorSessions(operatorId: string, exceptTokenHash: string | null) {
  await q().run(
    `DELETE FROM "OperatorSession" WHERE "operatorId" = ? AND "tokenHash" != ?`,
    operatorId, exceptTokenHash ?? ""
  );
}

/** Events about the platform: operators signing in, clinics created or
 *  changed. A change to a clinic is also written to that clinic's own log. */
export function listPlatformAudit(limit = 200): Promise<AuditEvent[]> {
  return q().all<AuditEvent>(
    `SELECT * FROM "AuditEvent" WHERE action LIKE 'operator_%' OR action LIKE 'clinic_%' ORDER BY at DESC LIMIT ?`,
    limit
  );
}
