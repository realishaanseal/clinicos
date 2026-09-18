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
import { BACKEND, DB_PATH, isUniqueViolation, q, tx } from "./sql";
import { localDay, localDayBounds } from "./time";
import { planOf, type Plan } from "./types";

export { localDay };

/** Full human-readable export. Deliberately independent of the database so the
 *  clinic's records survive even if this app does not. Accounts and sessions
 *  are left out: they are not clinical records, and hashes have no business
 *  in a file people email around. */
export async function exportEverything() {
  const patients = await q().all<Patient>(`SELECT * FROM "Patient" ORDER BY "createdAt"`);
  const out = [];
  for (const p of patients) {
    const consults = await q().all<Consult>(`SELECT * FROM "Consult" WHERE "patientId" = ? ORDER BY "createdAt"`, p.id);
    const withEdits = [];
    for (const c of consults) {
      withEdits.push({ ...c, audioPath: undefined, edits: await editsFor(c.id) });
    }
    out.push({ ...p, consults: withEdits });
  }
  // Favourites are the doctors' own work, so they leave with the clinic too.
  const favourites = await q().all<{ doctor: string | null; name: string; noteJson: string }>(
    `SELECT u.name AS doctor, f.name, f."noteJson" FROM "Favourite" f LEFT JOIN "User" u ON u.id = f."userId" ORDER BY u.name, LOWER(f.name)`
  );
  return {
    format: "clinicos-full-export",
    version: 1,
    exportedAt: now(),
    patients: out,
    favourites: favourites.map((f) => ({ doctor: f.doctor, name: f.name, note: JSON.parse(f.noteJson) })),
  };
}

function editsFor(consultId: string) {
  return q().all(`SELECT field, before, after, "createdAt" FROM "Edit" WHERE "consultId" = ? ORDER BY "createdAt"`, consultId);
}

// ---------------------------------------------------------------- helpers
export function newId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
const now = () => new Date().toISOString();

// ---------------------------------------------------------------- types
export type Patient = {
  id: string;
  name: string;
  age: number | null;
  sex: string | null;
  phone: string | null;
  guardianName: string | null;
  createdAt: string;
};

export type Consult = {
  id: string;
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
export async function createPatient(input: {
  name: string;
  age?: number | null;
  sex?: string | null;
  phone?: string | null;
  guardianName?: string | null;
}): Promise<Patient> {
  const id = newId();
  await q().run(
    `INSERT INTO "Patient" (id, name, age, sex, phone, "guardianName", "createdAt")
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, input.name, input.age ?? null, input.sex || null, input.phone || null, input.guardianName || null, now()
  );
  return (await getPatient(id))!;
}

export function getPatient(id: string): Promise<Patient | undefined> {
  return q().get<Patient>(`SELECT * FROM "Patient" WHERE id = ?`, id);
}

type PatientListRow = Patient & { consultCount: number };

/**
 * Find patients by name, or by phone number when the search is a number.
 *
 * Patients forget how their name was spelt last time; they never forget their
 * number (backlog #8). Phone matching ignores spaces, dashes, brackets and a
 * leading +91, because nobody types a number the way it was first written down.
 */
export async function searchPatients(qText: string): Promise<PatientListRow[]> {
  const term = qText.trim();
  const base = `SELECT p.*, (SELECT CAST(COUNT(*) AS INTEGER) FROM "Consult" c WHERE c."patientId" = p.id) AS "consultCount" FROM "Patient" p`;
  if (!term) {
    return q().all<PatientListRow>(`${base} ORDER BY p."createdAt" DESC LIMIT 50`);
  }

  const compact = term.replace(/[\s()+-]/g, "");
  if (/^\d{3,}$/.test(compact)) {
    const digits = compact.length > 10 ? compact.slice(-10) : compact;
    return q().all<PatientListRow>(
      `${base}
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(p.phone, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?
       ORDER BY p."createdAt" DESC LIMIT 50`,
      `%${digits}%`
    );
  }

  // SQLite's LIKE ignores case and Postgres's does not; LOWER() on both sides
  // gives both the same answer.
  return q().all<PatientListRow>(
    `${base} WHERE LOWER(p.name) LIKE LOWER(?) ORDER BY p."createdAt" DESC LIMIT 50`,
    `%${term}%`
  );
}

// ---------------------------------------------------------------- consults
export async function createConsult(patientId: string, createdBy: string | null = null): Promise<Consult> {
  const id = newId();
  await q().run(
    `INSERT INTO "Consult" (id, "patientId", "createdBy", "createdAt") VALUES (?, ?, ?, ?)`,
    id, patientId, createdBy, now()
  );
  return (await getConsult(id))!;
}

export function getConsult(id: string): Promise<Consult | undefined> {
  return q().get<Consult>(`SELECT * FROM "Consult" WHERE id = ?`, id);
}

export async function getConsultWithPatient(id: string): Promise<ConsultWithPatient | undefined> {
  const c = await getConsult(id);
  if (!c) return undefined;
  const p = await getPatient(c.patientId);
  if (!p) return undefined;
  return { ...c, patient: p };
}

export async function recentConsults(limit = 25): Promise<ConsultWithPatient[]> {
  const rows = await q().all<Consult>(`SELECT * FROM "Consult" ORDER BY "createdAt" DESC LIMIT ?`, limit);
  const out: ConsultWithPatient[] = [];
  for (const c of rows) {
    const patient = await getPatient(c.patientId);
    if (patient) out.push({ ...c, patient });
  }
  return out;
}

export async function consultsForPatient(patientId: string): Promise<(Consult & { editCount: number })[]> {
  const rows = await q().all<Consult>(
    `SELECT * FROM "Consult" WHERE "patientId" = ? ORDER BY "createdAt" DESC`,
    patientId
  );
  const out = [];
  for (const c of rows) out.push({ ...c, editCount: await countEdits(c.id) });
  return out;
}

export function previousSignedConsults(patientId: string, excludeId: string, limit = 3): Promise<Consult[]> {
  return q().all<Consult>(
    `SELECT * FROM "Consult"
     WHERE "patientId" = ? AND id != ? AND "signedAt" IS NOT NULL
     ORDER BY "signedAt" DESC LIMIT ?`,
    patientId, excludeId, limit
  );
}

export async function setConsent(id: string, by: string) {
  await q().run(`UPDATE "Consult" SET "consentGiven" = 1, "consentAt" = ?, "consentBy" = ? WHERE id = ?`, now(), by, id);
}

export async function setAudio(id: string, audioPath: string, bytes: number, seconds: number | null) {
  await q().run(
    `UPDATE "Consult" SET "audioPath" = ?, "audioBytes" = ?, "audioSeconds" = ? WHERE id = ?`,
    audioPath, bytes, seconds, id
  );
}

export async function setTranscript(id: string, transcript: string, model: string, seconds: number) {
  await q().run(
    `UPDATE "Consult" SET transcript = ?, "asrModel" = ?, "asrSeconds" = ?, "transcribedAt" = ? WHERE id = ?`,
    transcript, model, seconds, now(), id
  );
}

export async function setDraft(id: string, transcript: string, draftJson: string, model: string, seconds: number) {
  await q().run(
    `UPDATE "Consult" SET transcript = ?, "draftJson" = ?, "llmModel" = ?, "llmSeconds" = ?, "draftedAt" = ? WHERE id = ?`,
    transcript, draftJson, model, seconds, now(), id
  );
}

export async function signConsult(id: string, finalJson: string, audioDeleted: boolean, doctorId: string | null) {
  await q().run(
    `UPDATE "Consult"
     SET "finalJson" = ?, "signedAt" = ?, "audioPath" = NULL, "audioDeletedAt" = ?,
         "workingJson" = NULL, "recordingEndedAt" = COALESCE("recordingEndedAt", ?), "doctorId" = ?
     WHERE id = ?`,
    finalJson, now(), audioDeleted ? now() : null, now(), doctorId, id
  );
}

// ------------------------------------------------------------------- edits
export async function addEdits(consultId: string, edits: { field: string; before: string; after: string }[]) {
  if (!edits.length) return;
  await tx(async () => {
    for (const e of edits) {
      await q().run(
        `INSERT INTO "Edit" (id, "consultId", field, before, after, "createdAt") VALUES (?, ?, ?, ?, ?, ?)`,
        newId(), consultId, e.field, e.before, e.after, now()
      );
    }
  });
}

async function count(sql: string, ...params: string[]): Promise<number> {
  return (await q().get<{ n: number }>(sql, ...params))?.n ?? 0;
}

export function countEdits(consultId?: string): Promise<number> {
  return consultId
    ? count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Edit" WHERE "consultId" = ?`, consultId)
    : count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Edit"`);
}

export function countSignedConsults(): Promise<number> {
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE "signedAt" IS NOT NULL`);
}

export function countPatients(): Promise<number> {
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Patient"`);
}

export function countConsultsToday(): Promise<number> {
  // The clinic's local day. Comparing the UTC date put every consultation
  // before 05:30 IST under the previous day.
  const [start, end] = localDayBounds();
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE "createdAt" >= ? AND "createdAt" < ?`, start, end);
}

/** Signed consultations since a moment, with the signing doctor's name. Raw
 *  rows for simple counting — no scores, no rankings. */
export function signedConsultsSince(sinceIso: string): Promise<{ doctorName: string | null; signedAt: string }[]> {
  return q().all(
    `SELECT u.name AS "doctorName", c."signedAt"
     FROM "Consult" c LEFT JOIN "User" u ON u.id = c."doctorId"
     WHERE c."signedAt" IS NOT NULL AND c."signedAt" >= ?
     ORDER BY c."signedAt"`,
    sinceIso
  );
}

/** Signed notes that began as an AI draft. A note the doctor wrote by hand
 *  saved them nothing and had nothing to correct, so it counts in neither the
 *  time saved nor the edits per note. */
export function countDraftedSignedConsults(): Promise<number> {
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE "signedAt" IS NOT NULL AND "draftJson" IS NOT NULL`);
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

export function stepTimingsSince(sinceIso: string): Promise<StepTiming[]> {
  return q().all<StepTiming>(
    `SELECT "createdAt", "signedAt", CASE WHEN "draftJson" IS NULL THEN 0 ELSE 1 END AS drafted,
            "audioSeconds", "asrSeconds", "llmSeconds", "recordingEndedAt", "transcribedAt", "draftedAt"
     FROM "Consult" WHERE "signedAt" IS NOT NULL AND "signedAt" >= ? ORDER BY "signedAt"`,
    sinceIso
  );
}

/** Minutes of documentation saved, at a conservative 4 minutes per signed,
 *  AI-drafted note. Deliberately conservative: this number goes in front of
 *  doctors, and one they can disbelieve costs you more than a smaller one they
 *  accept. */
export async function minutesSaved(): Promise<number> {
  return (await countDraftedSignedConsults()) * 4;
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
export async function deletePatientCascade(id: string): Promise<DeletionReport | null> {
  const patient = await getPatient(id);
  if (!patient) return null;

  const consults = await q().all<{ id: string; audioPath: string | null }>(
    `SELECT id, "audioPath" FROM "Consult" WHERE "patientId" = ?`,
    id
  );
  const audioPaths = consults.map((c) => c.audioPath).filter(Boolean) as string[];

  let editsDeleted = 0;
  for (const c of consults) editsDeleted += await countEdits(c.id);

  await q().run(`DELETE FROM "Patient" WHERE id = ?`, id); // cascades to Consult -> Edit, QueueEntry

  return {
    patientName: patient.name,
    consultsDeleted: consults.length,
    editsDeleted,
    audioPaths,
  };
}

export function countConsultsForPatient(patientId: string): Promise<number> {
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE "patientId" = ?`, patientId);
}

/** Everything about one patient, for export before deletion. */
export async function exportPatient(id: string) {
  const patient = await getPatient(id);
  if (!patient) return null;
  const consults = await q().all<Consult>(`SELECT * FROM "Consult" WHERE "patientId" = ? ORDER BY "createdAt"`, id);
  const withEdits = [];
  for (const c of consults) withEdits.push({ ...c, audioPath: undefined, edits: await editsFor(c.id) });
  return { exportedAt: now(), patient, consults: withEdits };
}

export async function databaseStats() {
  return {
    patients: await countPatients(),
    consults: await count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult"`),
    signed: await countSignedConsults(),
    edits: await countEdits(),
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

export async function markRecordingStarted(id: string) {
  await q().run(`UPDATE "Consult" SET "recordingStartedAt" = ?, "recordingEndedAt" = NULL WHERE id = ?`, now(), id);
}

export async function markRecordingEnded(id: string, seconds: number | null, bytes: number | null) {
  await q().run(
    `UPDATE "Consult" SET "recordingEndedAt" = ?, "audioSeconds" = ?, "audioBytes" = ? WHERE id = ?`,
    now(), seconds, bytes, id
  );
}

export async function setAudioPath(id: string, audioPath: string) {
  await q().run(`UPDATE "Consult" SET "audioPath" = ? WHERE id = ?`, audioPath, id);
}

/** Debounced autosave from the editor. Never touches draftJson — the AI's
 *  original must stay intact so the edit diff at signing is still honest. */
export async function saveWorking(id: string, transcript: string | null, workingJson: string | null) {
  const parts: string[] = [`"workingSavedAt" = ?`];
  const args: (string | null)[] = [now()];
  if (transcript !== null) { parts.push("transcript = ?"); args.push(transcript); }
  if (workingJson !== null) { parts.push(`"workingJson" = ?`); args.push(workingJson); }
  args.push(id);
  await q().run(`UPDATE "Consult" SET ${parts.join(", ")} WHERE id = ?`, ...args);
}

export type UnfinishedConsult = ConsultWithPatient & { reason: string };

/** Consultations that were started and never signed. Surfaced on Today so an
 *  interrupted visit cannot silently disappear. */
export async function unfinishedConsults(): Promise<UnfinishedConsult[]> {
  const rows = await q().all<Consult>(
    `SELECT * FROM "Consult"
     WHERE "signedAt" IS NULL
       AND ("audioPath" IS NOT NULL OR transcript IS NOT NULL
            OR "workingJson" IS NOT NULL OR "draftJson" IS NOT NULL)
     ORDER BY "createdAt" DESC LIMIT 20`
  );

  const out: UnfinishedConsult[] = [];
  for (const c of rows) {
    const patient = await getPatient(c.patientId);
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

export function getQueueEntry(id: string): Promise<QueueEntry | undefined> {
  return q().get<QueueEntry>(`SELECT * FROM "QueueEntry" WHERE id = ?`, id);
}

export function todaysQueue(): Promise<QueueRow[]> {
  return q().all<QueueRow>(
    `SELECT qe.*, p.name AS "patientName", p.age AS "patientAge", p.sex AS "patientSex", p.phone AS "patientPhone",
            d.name AS "calledByName"
     FROM "QueueEntry" qe
     JOIN "Patient" p ON p.id = qe."patientId"
     LEFT JOIN "User" d ON d.id = qe."calledBy"
     WHERE qe.day = ?
     ORDER BY qe.token`,
    localDay()
  );
}

/**
 * Put a patient on today's list. A patient already waiting or with a doctor
 * keeps their token rather than getting a second one, so a receptionist who
 * adds someone twice does not make them queue twice.
 *
 * Two desks adding at the same instant can both read the same highest token.
 * SQLite never sees that, because its transactions run one at a time; Postgres
 * does, and the unique index on (day, token) turns the loser's insert into an
 * error. That is the signal to read again and take the next number.
 */
export async function addToQueue(
  patientId: string,
  addedBy: string | null
): Promise<{ entry: QueueEntry; alreadyQueued: boolean }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tx(async () => {
        const day = localDay();
        const existing = await q().get<QueueEntry>(
          `SELECT * FROM "QueueEntry" WHERE day = ? AND "patientId" = ? AND status IN ('waiting', 'with-doctor')`,
          day, patientId
        );
        if (existing) return { entry: existing, alreadyQueued: true };

        const token = (await q().get<{ t: number }>(
          `SELECT CAST(COALESCE(MAX(token), 0) + 1 AS INTEGER) AS t FROM "QueueEntry" WHERE day = ?`,
          day
        ))!.t;
        const id = newId();
        await q().run(
          `INSERT INTO "QueueEntry" (id, "patientId", day, token, status, "addedBy", "addedAt")
           VALUES (?, ?, ?, ?, 'waiting', ?, ?)`,
          id, patientId, day, token, addedBy, now()
        );
        return { entry: (await getQueueEntry(id))!, alreadyQueued: false };
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

export async function startQueueEntry(id: string, doctorId: string): Promise<QueueEntry | null> {
  try {
    return await tx(async () => {
      const e = await getQueueEntry(id);
      if (!e || e.day !== localDay()) return null;
      if (e.status === "with-doctor" && e.calledBy === doctorId && e.consultId) return e;
      if (e.status !== "waiting") return null;

      let consultId = e.consultId;
      const existing = consultId ? await getConsult(consultId) : undefined;
      if (!existing || existing.signedAt) consultId = (await createConsult(e.patientId, doctorId)).id;

      const { changes } = await q().run(
        `UPDATE "QueueEntry" SET status = 'with-doctor', "consultId" = ?, "calledBy" = ?, "calledAt" = ?
         WHERE id = ? AND status = 'waiting'`,
        consultId, doctorId, now(), id
      );
      if (changes !== 1) throw new TakenByAnother();
      return (await getQueueEntry(id))!;
    });
  } catch (e) {
    if (!(e instanceof TakenByAnother)) throw e;
    // Pressed twice at once by the same doctor: the other press won, and it is theirs.
    const after = await getQueueEntry(id);
    return after && after.status === "with-doctor" && after.calledBy === doctorId && after.consultId ? after : null;
  }
}

/** The patient went home without being seen. Only a waiting entry can leave. */
export async function markQueueLeft(id: string): Promise<boolean> {
  const { changes } = await q().run(
    `UPDATE "QueueEntry" SET status = 'left', "doneAt" = ? WHERE id = ? AND status = 'waiting'`,
    now(), id
  );
  return changes === 1;
}

/** Signing the consultation is what marks the patient as seen. */
export async function markQueueDoneForConsult(consultId: string) {
  await q().run(
    `UPDATE "QueueEntry" SET status = 'done', "doneAt" = ? WHERE "consultId" = ? AND status = 'with-doctor'`,
    now(), consultId
  );
}

// ---------------------------------------------------------------- accounts
export type Role = "doctor" | "staff" | "admin";

export type UserRow = {
  id: string;
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
  `id, name, username, role, "isAdmin", qualification, "regNo", active, "mustChangePassword", "createdAt", "lastLoginAt"`;

/** Admin access follows from the role for staff and admins; only a doctor's is
 *  a separate choice. Normalising here means no row can say "staff, admin". */
function adminFlag(role: Role, isAdmin: boolean): number {
  if (role === "admin") return 1;
  if (role === "staff") return 0;
  return isAdmin ? 1 : 0;
}

export function countUsers(): Promise<number> {
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "User"`);
}

/** People who can still manage the clinic. Guards against locking everyone out. */
export function countActiveAdmins(): Promise<number> {
  return count(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "User" WHERE active = 1 AND "isAdmin" = 1`);
}

export function getUserRow(id: string): Promise<UserRow | undefined> {
  return q().get<UserRow>(`SELECT * FROM "User" WHERE id = ?`, id);
}

export function getUserPublic(id: string): Promise<PublicUser | undefined> {
  return q().get<PublicUser>(`SELECT ${PUBLIC_USER_COLUMNS} FROM "User" WHERE id = ?`, id);
}

/** Usernames never differ only by case. SQLite's column ignores case on its
 *  own; LOWER() says the same thing to Postgres. */
export function getUserByUsername(username: string): Promise<UserRow | undefined> {
  return q().get<UserRow>(`SELECT * FROM "User" WHERE LOWER(username) = LOWER(?)`, username);
}

export function listUsers(): Promise<PublicUser[]> {
  return q().all<PublicUser>(`SELECT ${PUBLIC_USER_COLUMNS} FROM "User" ORDER BY active DESC, LOWER(name)`);
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

export async function createUser(u: NewUser): Promise<UserRow> {
  const id = newId();
  await q().run(
    `INSERT INTO "User" (id, name, username, role, "isAdmin", "passwordHash", qualification, "regNo",
                         active, "mustChangePassword", "createdAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id,
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
  return (await getUserRow(id))!;
}

/**
 * The first account, created from /setup. Two browsers submitting setup at the
 * same moment must not both become the owner.
 *
 * Checking that there are no accounts is not enough on Postgres, where both
 * transactions can see an empty table. So setup also claims a row with a fixed
 * key: the second insert waits for the first transaction, then conflicts and
 * inserts nothing, and that transaction gives up.
 */
export async function createFirstAccount(u: NewUser, clinicName: string): Promise<UserRow | null> {
  return tx(async () => {
    if ((await countUsers()) > 0) return null;
    const claimed = await q().run(
      `INSERT INTO "Setting" (key, value) VALUES ('setup_claimed_at', ?) ON CONFLICT DO NOTHING`,
      now()
    );
    if (claimed.changes !== 1 && (await countUsers()) > 0) return null;
    const user = await createUser(u);
    await setSettings({ clinic_name: clinicName });
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

export async function updateUser(id: string, patch: UserPatch) {
  const current = await getUserRow(id);
  if (!current) return;
  const role = patch.role ?? current.role;
  const isAdmin = adminFlag(role, patch.isAdmin ?? !!current.isAdmin);
  await q().run(
    `UPDATE "User" SET name = ?, role = ?, "isAdmin" = ?, qualification = ?, "regNo" = ?, active = ? WHERE id = ?`,
    patch.name ?? current.name,
    role,
    isAdmin,
    patch.qualification !== undefined ? patch.qualification : current.qualification,
    patch.regNo !== undefined ? patch.regNo : current.regNo,
    patch.active !== undefined ? (patch.active ? 1 : 0) : current.active,
    id
  );
}

export async function setUserPassword(id: string, passwordHash: string, mustChange: boolean) {
  await q().run(`UPDATE "User" SET "passwordHash" = ?, "mustChangePassword" = ? WHERE id = ?`, passwordHash, mustChange ? 1 : 0, id);
}

export async function touchLogin(id: string) {
  await q().run(`UPDATE "User" SET "lastLoginAt" = ? WHERE id = ?`, now(), id);
}

/** Put an account back exactly as it was, hash included. Used after restoring a
 *  backup that predates accounts, so the person restoring is not locked out. */
export async function reinsertUserRow(row: UserRow) {
  await q().run(
    `INSERT INTO "User" (id, name, username, role, "isAdmin", "passwordHash", qualification, "regNo",
                         active, "mustChangePassword", "createdAt", "lastLoginAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
    row.id, row.name, row.username, row.role, row.isAdmin, row.passwordHash, row.qualification,
    row.regNo, row.active, row.mustChangePassword, row.createdAt, row.lastLoginAt
  );
}

// ---------------------------------------------------------------- sessions
export type SessionJoin = {
  tokenHash: string;
  expiresAt: string;
  lastSeenAt: string;
  id: string;
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

/** A live session and its account. Deactivated accounts and expired sessions
 *  simply do not match, so there is no separate check to forget. */
export function getSessionUser(tokenHash: string): Promise<SessionJoin | undefined> {
  return q().get<SessionJoin>(
    `SELECT s."tokenHash", s."expiresAt", s."lastSeenAt",
            u.id, u.name, u.username, u.role, u."isAdmin", u.qualification, u."regNo", u."mustChangePassword"
     FROM "Session" s JOIN "User" u ON u.id = s."userId"
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
  userId: string | null;
  userName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  at: string;
};

export async function recordAudit(
  actor: AuditActor,
  action: string,
  targetType: string | null = null,
  targetId: string | null = null,
  detail: string | null = null
) {
  await q().run(
    `INSERT INTO "AuditEvent" (id, "userId", "userName", action, "targetType", "targetId", detail, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(), actor?.id ?? null, actor?.name ?? null, action, targetType, targetId, detail, now()
  );
}

export function listAudit(limit = 300): Promise<AuditEvent[]> {
  return q().all<AuditEvent>(`SELECT * FROM "AuditEvent" ORDER BY at DESC LIMIT ?`, limit);
}

/**
 * Wrong passwords for one username since a moment, read from the activity log.
 *
 * The count used to live in the server's memory, which was fine on one laptop.
 * Online there are many short-lived copies of the server, each with its own
 * empty memory, so a guesser would never be slowed. The log is shared by all
 * of them, and every failed sign-in is already written there.
 */
export function failedLoginsSince(username: string, sinceIso: string): Promise<number> {
  return count(
    `SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "AuditEvent" WHERE action = 'login_failed' AND detail = ? AND at > ?`,
    `username: ${username}`,
    sinceIso
  );
}

// -------------------------------------------------------------- favourites
/**
 * A doctor's own saved prescriptions. Each doctor sees and changes only their
 * own: every query here is scoped by userId, and the routes pass the signed-in
 * account's id, never one from the request.
 */
export type Favourite = {
  id: string;
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
          `INSERT INTO "Favourite" (id, "userId", name, "noteJson", "useCount", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, 0, ?, ?)`,
          newId(), userId, name, noteJson, at, at
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
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await q().all<{ key: string; value: string }>(`SELECT key, value FROM "Setting"`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSettings(values: Record<string, string>) {
  await tx(async () => {
    for (const [k, v] of Object.entries(values)) {
      await q().run(
        `INSERT INTO "Setting" (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        k, v
      );
    }
  });
}
