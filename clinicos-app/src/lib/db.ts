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
  const out = [];
  for (const p of patients) {
    const consults = await q().all<Consult>(
      `SELECT * FROM "Consult" WHERE "clinicId" = ? AND "patientId" = ? ORDER BY "createdAt"`,
      clinicId, p.id
    );
    const withEdits = [];
    for (const c of consults) {
      withEdits.push({ ...c, audioPath: undefined, edits: await editsFor(clinicId, c.id) });
    }
    out.push({ ...p, consults: withEdits });
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
  draftedAt: string | null;
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

export async function recentConsults(clinicId: ClinicId, limit = 25): Promise<ConsultWithPatient[]> {
  const rows = await q().all<Consult>(
    `SELECT * FROM "Consult" WHERE "clinicId" = ? ORDER BY "createdAt" DESC LIMIT ?`,
    clinicId, limit
  );
  const out: ConsultWithPatient[] = [];
  for (const c of rows) {
    const patient = await getPatient(clinicId, c.patientId);
    if (patient) out.push({ ...c, patient });
  }
  return out;
}

export async function consultsForPatient(clinicId: ClinicId, patientId: string): Promise<(Consult & { editCount: number })[]> {
  const rows = await q().all<Consult>(
    `SELECT * FROM "Consult" WHERE "clinicId" = ? AND "patientId" = ? ORDER BY "createdAt" DESC`,
    clinicId, patientId
  );
  const out = [];
  for (const c of rows) out.push({ ...c, editCount: await countEdits(clinicId, c.id) });
  return out;
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

export async function setTranscript(clinicId: ClinicId, id: string, transcript: string, model: string, seconds: number) {
  await q().run(
    `UPDATE "Consult" SET transcript = ?, "asrModel" = ?, "asrSeconds" = ?, "transcribedAt" = ? WHERE id = ? AND "clinicId" = ?`,
    transcript, model, seconds, now(), id, clinicId
  );
}

export async function setDraft(clinicId: ClinicId, id: string, transcript: string, draftJson: string, model: string, seconds: number) {
  await q().run(
    `UPDATE "Consult" SET transcript = ?, "draftJson" = ?, "llmModel" = ?, "llmSeconds" = ?, "draftedAt" = ?
     WHERE id = ? AND "clinicId" = ?`,
    transcript, draftJson, model, seconds, now(), id, clinicId
  );
}

export async function signConsult(clinicId: ClinicId, id: string, finalJson: string, audioDeleted: boolean, doctorId: string | null) {
  await q().run(
    `UPDATE "Consult"
     SET "finalJson" = ?, "signedAt" = ?, "audioPath" = NULL, "audioDeletedAt" = ?,
         "workingJson" = NULL, "recordingEndedAt" = COALESCE("recordingEndedAt", ?), "doctorId" = ?
     WHERE id = ? AND "clinicId" = ?`,
    finalJson, now(), audioDeleted ? now() : null, now(), doctorId, id, clinicId
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
  return { exportedAt: now(), patient, consults: withEdits };
}

export async function databaseStats(clinicId: ClinicId) {
  return {
    patients: await countPatients(clinicId),
    consults: await count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE "clinicId" = ?`, clinicId),
    signed: await countSignedConsults(clinicId),
    edits: await countEdits(clinicId),
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

export async function markRecordingEnded(clinicId: ClinicId, id: string, seconds: number | null, bytes: number | null) {
  await q().run(
    `UPDATE "Consult" SET "recordingEndedAt" = ?, "audioSeconds" = ?, "audioBytes" = ? WHERE id = ? AND "clinicId" = ?`,
    now(), seconds, bytes, id, clinicId
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
  const rows = await q().all<Consult>(
    `SELECT * FROM "Consult"
     WHERE "clinicId" = ? AND "signedAt" IS NULL
       AND ("audioPath" IS NOT NULL OR transcript IS NOT NULL
            OR "workingJson" IS NOT NULL OR "draftJson" IS NOT NULL)
     ORDER BY "createdAt" DESC LIMIT 20`,
    clinicId
  );

  const out: UnfinishedConsult[] = [];
  for (const c of rows) {
    const patient = await getPatient(clinicId, c.patientId);
    if (!patient) continue;
    let reason = "Started but not signed";
    if (c.recordingStartedAt && !c.recordingEndedAt) reason = "Recording was interrupted";
    else if (c.workingJson) reason = "Unsigned note with your edits";
    else if (c.draftJson) reason = "Note drafted, not signed";
    else if (c.transcript) reason = "Transcribed, no note yet";
    else if (c.audioPath) reason = "Audio captured, not transcribed";
    out.push({ ...c, patient, reason });
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
