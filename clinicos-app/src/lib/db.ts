/**
 * Storage. Plain SQLite, no ORM.
 *
 * A single file at ./data/clinicos.db. Back it up with the tools in backup.ts,
 * never by copying the file — see the WAL note there. When you eventually
 * deploy, this is the layer you replace — everything above it talks to the
 * functions exported here, not to SQL.
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export const DB_PATH = path.resolve(process.env.DB_PATH || "./data/clinicos.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const globalForDb = globalThis as unknown as { clinicosDb?: Database.Database };

function open(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS Patient (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      age           INTEGER,
      sex           TEXT,
      phone         TEXT,
      guardianName  TEXT,
      createdAt     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_patient_name ON Patient(name);

    CREATE TABLE IF NOT EXISTS Consult (
      id             TEXT PRIMARY KEY,
      patientId      TEXT NOT NULL REFERENCES Patient(id) ON DELETE CASCADE,
      consentGiven   INTEGER NOT NULL DEFAULT 0,
      consentAt      TEXT,
      consentBy      TEXT,
      audioPath      TEXT,
      audioBytes     INTEGER,
      audioSeconds   REAL,
      audioDeletedAt TEXT,
      transcript     TEXT,
      asrModel       TEXT,
      asrSeconds     REAL,
      draftJson      TEXT,
      finalJson      TEXT,
      llmModel       TEXT,
      llmSeconds     REAL,
      signedAt       TEXT,
      createdAt      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_consult_patient ON Consult(patientId);
    CREATE INDEX IF NOT EXISTS idx_consult_created ON Consult(createdAt);

    -- Every correction the doctor makes to the AI draft. This is your accuracy
    -- metric, your training signal, and the most persuasive artefact you can
    -- show a clinical advisor or an investor. Never bypass it.
    CREATE TABLE IF NOT EXISTS Edit (
      id        TEXT PRIMARY KEY,
      consultId TEXT NOT NULL REFERENCES Consult(id) ON DELETE CASCADE,
      field     TEXT NOT NULL,
      before    TEXT NOT NULL,
      after     TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_edit_consult ON Edit(consultId);

    -- Accounts, added in v0.5. Every database from before then has none, so
    -- nothing may assume a row exists: an empty User table means "run setup".
    CREATE TABLE IF NOT EXISTS User (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      username           TEXT NOT NULL UNIQUE COLLATE NOCASE,
      role               TEXT NOT NULL CHECK (role IN ('doctor', 'staff', 'admin')),
      isAdmin            INTEGER NOT NULL DEFAULT 0,
      passwordHash       TEXT NOT NULL,
      qualification      TEXT,
      regNo              TEXT,
      active             INTEGER NOT NULL DEFAULT 1,
      mustChangePassword INTEGER NOT NULL DEFAULT 0,
      createdAt          TEXT NOT NULL,
      lastLoginAt        TEXT
    );

    -- Only a SHA-256 of the cookie token is stored, so a copied database or a
    -- downloaded backup cannot be used to sign in as anyone.
    CREATE TABLE IF NOT EXISTS Session (
      tokenHash  TEXT PRIMARY KEY,
      userId     TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      createdAt  TEXT NOT NULL,
      expiresAt  TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_user ON Session(userId);

    -- Who did what. The app only ever inserts here. userName is copied in so
    -- the log still reads correctly after someone is renamed, and there is no
    -- foreign key so a row outlives anything it refers to. Never put a
    -- patient's name in detail: a deleted record must not survive in the log.
    CREATE TABLE IF NOT EXISTS AuditEvent (
      id         TEXT PRIMARY KEY,
      userId     TEXT,
      userName   TEXT,
      action     TEXT NOT NULL,
      targetType TEXT,
      targetId   TEXT,
      detail     TEXT,
      at         TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_at ON AuditEvent(at);

    -- Clinic identity edited in the app. Falls back to .env (see clinic.ts).
    CREATE TABLE IF NOT EXISTS Setting (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- The day's list at the front desk (v0.5). day is the clinic computer's
    -- local date, never a UTC date: in India a UTC date would file the first
    -- five and a half hours of every day under yesterday. Tokens restart at 1
    -- each day, and the unique index makes a duplicate token impossible even
    -- if two desks add a patient at the same instant.
    CREATE TABLE IF NOT EXISTS QueueEntry (
      id         TEXT PRIMARY KEY,
      patientId  TEXT NOT NULL REFERENCES Patient(id) ON DELETE CASCADE,
      day        TEXT NOT NULL,
      token      INTEGER NOT NULL,
      status     TEXT NOT NULL CHECK (status IN ('waiting', 'with-doctor', 'done', 'left')),
      addedBy    TEXT,
      consultId  TEXT,
      calledBy   TEXT,
      addedAt    TEXT NOT NULL,
      calledAt   TEXT,
      doneAt     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_queue_day ON QueueEntry(day);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_token ON QueueEntry(day, token);
  `);

  // Columns added after the first release. SQLite has no "ADD COLUMN IF NOT
  // EXISTS", so check what is already there. Existing pilot databases must
  // survive an upgrade untouched — never drop and recreate.
  const known = new Map<string, Set<string>>();
  const addColumn = (table: string, col: string, decl: string) => {
    if (!known.has(table)) {
      known.set(
        table,
        new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name))
      );
    }
    if (known.get(table)!.has(col)) return;
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
    } catch (e) {
      // The snapshot above is taken before these run, so another process can
      // add the column in between and make it stale. That is not hypothetical:
      // `next build` collects page data in parallel workers, each of which
      // imports this module and runs these migrations against the same file.
      // SQLite has no "ADD COLUMN IF NOT EXISTS", so losing the race is benign
      // — the column exists, which is all we wanted. Anything else is real.
      if (!/duplicate column name/i.test(String((e as Error)?.message))) throw e;
    }
  };
  addColumn("Consult", "workingJson", "TEXT");      // the doctor's in-progress edits, autosaved
  addColumn("Consult", "workingSavedAt", "TEXT");
  addColumn("Consult", "recordingStartedAt", "TEXT");
  addColumn("Consult", "recordingEndedAt", "TEXT"); // null while a recording is still open
  addColumn("Consult", "createdBy", "TEXT");        // v0.5: the account that opened the consultation
  addColumn("Consult", "doctorId", "TEXT");         // v0.5: the doctor who signed; NULL on older rows

  return db;
}

let handle: Database.Database = globalForDb.clinicosDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.clinicosDb = handle;

/** The live connection. Always call this — never cache the result, because a
 *  restore replaces the underlying connection. */
export function getDb(): Database.Database {
  return handle;
}

/** Reopen after a restore has swapped the file on disk. */
export function reopenDatabase(): void {
  try {
    handle.close();
  } catch {
    /* already closed */
  }
  handle = open();
  if (process.env.NODE_ENV !== "production") globalForDb.clinicosDb = handle;
}

/** Full human-readable export. Deliberately independent of SQLite so the
 *  clinic's records survive even if this app does not. Accounts and sessions
 *  are left out: they are not clinical records, and hashes have no business
 *  in a file people email around. */
export function exportEverything() {
  const patients = getDb().prepare(`SELECT * FROM Patient ORDER BY createdAt`).all() as Patient[];
  return {
    format: "clinicos-full-export",
    version: 1,
    exportedAt: now(),
    patients: patients.map((p) => {
      const consults = getDb()
        .prepare(`SELECT * FROM Consult WHERE patientId = ? ORDER BY createdAt`)
        .all(p.id) as Consult[];
      return {
        ...p,
        consults: consults.map((c) => ({
          ...c,
          audioPath: undefined,
          edits: getDb()
            .prepare(`SELECT field, before, after, createdAt FROM Edit WHERE consultId = ?`)
            .all(c.id),
        })),
      };
    }),
  };
}

// ---------------------------------------------------------------- helpers
export function newId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
const now = () => new Date().toISOString();

/** The clinic computer's local calendar date, YYYY-MM-DD. Stored timestamps
 *  are UTC ISO strings; "today" has to mean the clinic's today. */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Start and end of the clinic's local day, as UTC ISO strings for comparing
 *  against stored timestamps. */
function localDayBounds(d = new Date()): [string, string] {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return [start.toISOString(), end.toISOString()];
}

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
  createdAt: string;
};

export type ConsultWithPatient = Consult & { patient: Patient };

// ---------------------------------------------------------------- patients
export function createPatient(input: {
  name: string;
  age?: number | null;
  sex?: string | null;
  phone?: string | null;
  guardianName?: string | null;
}): Patient {
  const id = newId();
  getDb().prepare(
    `INSERT INTO Patient (id, name, age, sex, phone, guardianName, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.name, input.age ?? null, input.sex || null, input.phone || null, input.guardianName || null, now());
  return getPatient(id)!;
}

export function getPatient(id: string): Patient | undefined {
  return getDb().prepare(`SELECT * FROM Patient WHERE id = ?`).get(id) as Patient | undefined;
}

/**
 * Find patients by name, or by phone number when the search is a number.
 *
 * Patients forget how their name was spelt last time; they never forget their
 * number (backlog #8). Phone matching ignores spaces, dashes, brackets and a
 * leading +91, because nobody types a number the way it was first written down.
 */
export function searchPatients(q: string): (Patient & { consultCount: number })[] {
  const term = q.trim();
  const base = `SELECT p.*, (SELECT COUNT(*) FROM Consult c WHERE c.patientId = p.id) AS consultCount FROM Patient p`;
  if (!term) {
    return getDb().prepare(`${base} ORDER BY p.createdAt DESC LIMIT 50`).all() as (Patient & { consultCount: number })[];
  }

  const compact = term.replace(/[\s()+-]/g, "");
  if (/^\d{3,}$/.test(compact)) {
    const digits = compact.length > 10 ? compact.slice(-10) : compact;
    return getDb()
      .prepare(
        `${base}
         WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(p.phone, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?
         ORDER BY p.createdAt DESC LIMIT 50`
      )
      .all(`%${digits}%`) as (Patient & { consultCount: number })[];
  }

  return getDb()
    .prepare(`${base} WHERE p.name LIKE ? ORDER BY p.createdAt DESC LIMIT 50`)
    .all(`%${term}%`) as (Patient & { consultCount: number })[];
}

// ---------------------------------------------------------------- consults
export function createConsult(patientId: string, createdBy: string | null = null): Consult {
  const id = newId();
  getDb()
    .prepare(`INSERT INTO Consult (id, patientId, createdBy, createdAt) VALUES (?, ?, ?, ?)`)
    .run(id, patientId, createdBy, now());
  return getConsult(id)!;
}

export function getConsult(id: string): Consult | undefined {
  return getDb().prepare(`SELECT * FROM Consult WHERE id = ?`).get(id) as Consult | undefined;
}

export function getConsultWithPatient(id: string): ConsultWithPatient | undefined {
  const c = getConsult(id);
  if (!c) return undefined;
  const p = getPatient(c.patientId);
  if (!p) return undefined;
  return { ...c, patient: p };
}

export function recentConsults(limit = 25): ConsultWithPatient[] {
  const rows = getDb()
    .prepare(`SELECT * FROM Consult ORDER BY createdAt DESC LIMIT ?`)
    .all(limit) as Consult[];
  return rows.map((c) => ({ ...c, patient: getPatient(c.patientId)! })).filter((r) => r.patient);
}

export function consultsForPatient(patientId: string): (Consult & { editCount: number })[] {
  const rows = getDb()
    .prepare(`SELECT * FROM Consult WHERE patientId = ? ORDER BY createdAt DESC`)
    .all(patientId) as Consult[];
  return rows.map((c) => ({ ...c, editCount: countEdits(c.id) }));
}

export function previousSignedConsults(patientId: string, excludeId: string, limit = 3): Consult[] {
  return getDb()
    .prepare(
      `SELECT * FROM Consult
       WHERE patientId = ? AND id != ? AND signedAt IS NOT NULL
       ORDER BY signedAt DESC LIMIT ?`
    )
    .all(patientId, excludeId, limit) as Consult[];
}

export function setConsent(id: string, by: string) {
  getDb().prepare(`UPDATE Consult SET consentGiven = 1, consentAt = ?, consentBy = ? WHERE id = ?`).run(now(), by, id);
}

export function setAudio(id: string, audioPath: string, bytes: number, seconds: number | null) {
  getDb().prepare(`UPDATE Consult SET audioPath = ?, audioBytes = ?, audioSeconds = ? WHERE id = ?`).run(
    audioPath,
    bytes,
    seconds,
    id
  );
}

export function setTranscript(id: string, transcript: string, model: string, seconds: number) {
  getDb().prepare(`UPDATE Consult SET transcript = ?, asrModel = ?, asrSeconds = ? WHERE id = ?`).run(
    transcript,
    model,
    seconds,
    id
  );
}

export function setDraft(id: string, transcript: string, draftJson: string, model: string, seconds: number) {
  getDb().prepare(
    `UPDATE Consult SET transcript = ?, draftJson = ?, llmModel = ?, llmSeconds = ? WHERE id = ?`
  ).run(transcript, draftJson, model, seconds, id);
}

export function signConsult(id: string, finalJson: string, audioDeleted: boolean, doctorId: string | null) {
  getDb().prepare(
    `UPDATE Consult
     SET finalJson = ?, signedAt = ?, audioPath = NULL, audioDeletedAt = ?,
         workingJson = NULL, recordingEndedAt = COALESCE(recordingEndedAt, ?), doctorId = ?
     WHERE id = ?`
  ).run(finalJson, now(), audioDeleted ? now() : null, now(), doctorId, id);
}

// ------------------------------------------------------------------- edits
export function addEdits(consultId: string, edits: { field: string; before: string; after: string }[]) {
  if (!edits.length) return;
  const stmt = getDb().prepare(
    `INSERT INTO Edit (id, consultId, field, before, after, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const tx = getDb().transaction((rows: typeof edits) => {
    for (const e of rows) stmt.run(newId(), consultId, e.field, e.before, e.after, now());
  });
  tx(edits);
}

export function countEdits(consultId?: string): number {
  const row = consultId
    ? (getDb().prepare(`SELECT COUNT(*) AS n FROM Edit WHERE consultId = ?`).get(consultId) as { n: number })
    : (getDb().prepare(`SELECT COUNT(*) AS n FROM Edit`).get() as { n: number });
  return row.n;
}

export function countSignedConsults(): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM Consult WHERE signedAt IS NOT NULL`).get() as { n: number };
  return row.n;
}

export function countPatients(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM Patient`).get() as { n: number }).n;
}

export function countConsultsToday(): number {
  // The clinic's local day. Comparing the UTC date put every consultation
  // before 05:30 IST under the previous day.
  const [start, end] = localDayBounds();
  return (
    getDb().prepare(`SELECT COUNT(*) AS n FROM Consult WHERE createdAt >= ? AND createdAt < ?`).get(start, end) as {
      n: number;
    }
  ).n;
}

/** Signed consultations since a moment, with the signing doctor's name. Raw
 *  rows for simple counting — no scores, no rankings. */
export function signedConsultsSince(sinceIso: string): { doctorName: string | null; signedAt: string }[] {
  return getDb()
    .prepare(
      `SELECT u.name AS doctorName, c.signedAt
       FROM Consult c LEFT JOIN User u ON u.id = c.doctorId
       WHERE c.signedAt IS NOT NULL AND c.signedAt >= ?
       ORDER BY c.signedAt`
    )
    .all(sinceIso) as { doctorName: string | null; signedAt: string }[];
}

/** Minutes of documentation saved, at a conservative 4 minutes per signed note.
 *  Deliberately conservative: this number goes in front of doctors, and one
 *  they can disbelieve costs you more than a smaller one they accept. */
export function minutesSaved(): number {
  return countSignedConsults() * 4;
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
 * Consults, edits and queue entries cascade via foreign keys. Audio paths are
 * returned so the caller can unlink the files — the database cannot delete
 * anything on disk.
 *
 * There is no undo. The route that calls this requires the caller to retype
 * the patient's name first, and that check exists for a reason.
 */
export function deletePatientCascade(id: string): DeletionReport | null {
  const patient = getPatient(id);
  if (!patient) return null;

  const consultIds = (
    getDb().prepare(`SELECT id, audioPath FROM Consult WHERE patientId = ?`).all(id) as {
      id: string;
      audioPath: string | null;
    }[]
  );
  const audioPaths = consultIds.map((c) => c.audioPath).filter(Boolean) as string[];

  const editsDeleted = consultIds.reduce((n, c) => n + countEdits(c.id), 0);

  const tx = getDb().transaction(() => {
    getDb().prepare(`DELETE FROM Patient WHERE id = ?`).run(id); // cascades to Consult -> Edit, QueueEntry
  });
  tx();

  return {
    patientName: patient.name,
    consultsDeleted: consultIds.length,
    editsDeleted,
    audioPaths,
  };
}

/** Everything about one patient, for export before deletion. */
export function exportPatient(id: string) {
  const patient = getPatient(id);
  if (!patient) return null;
  const consults = getDb().prepare(`SELECT * FROM Consult WHERE patientId = ? ORDER BY createdAt`).all(id) as Consult[];
  return {
    exportedAt: now(),
    patient,
    consults: consults.map((c) => ({
      ...c,
      audioPath: undefined,
      edits: getDb().prepare(`SELECT field, before, after, createdAt FROM Edit WHERE consultId = ?`).all(c.id),
    })),
  };
}

export function databaseStats() {
  return {
    patients: countPatients(),
    consults: (getDb().prepare(`SELECT COUNT(*) AS n FROM Consult`).get() as { n: number }).n,
    signed: countSignedConsults(),
    edits: countEdits(),
    path: DB_PATH,
  };
}

// ------------------------------------------------------- crash recovery
/**
 * Recovery is the whole point of this section.
 *
 * A consultation can be interrupted at any moment — the tab closes, the laptop
 * sleeps, the power goes. Whatever the doctor had said or typed up to that
 * instant must still be on disk. Losing one consultation in front of a waiting
 * patient is the failure that ends a pilot.
 */

export function markRecordingStarted(id: string) {
  getDb().prepare(
    `UPDATE Consult SET recordingStartedAt = ?, recordingEndedAt = NULL WHERE id = ?`
  ).run(now(), id);
}

export function markRecordingEnded(id: string, seconds: number | null, bytes: number | null) {
  getDb().prepare(
    `UPDATE Consult SET recordingEndedAt = ?, audioSeconds = ?, audioBytes = ? WHERE id = ?`
  ).run(now(), seconds, bytes, id);
}

export function setAudioPath(id: string, audioPath: string) {
  getDb().prepare(`UPDATE Consult SET audioPath = ? WHERE id = ?`).run(audioPath, id);
}

/** Debounced autosave from the editor. Never touches draftJson — the AI's
 *  original must stay intact so the edit diff at signing is still honest. */
export function saveWorking(id: string, transcript: string | null, workingJson: string | null) {
  const parts: string[] = ["workingSavedAt = ?"];
  const args: (string | null)[] = [now()];
  if (transcript !== null) { parts.push("transcript = ?"); args.push(transcript); }
  if (workingJson !== null) { parts.push("workingJson = ?"); args.push(workingJson); }
  args.push(id);
  getDb().prepare(`UPDATE Consult SET ${parts.join(", ")} WHERE id = ?`).run(...args);
}

export type UnfinishedConsult = ConsultWithPatient & { reason: string };

/** Consultations that were started and never signed. Surfaced on Today so an
 *  interrupted visit cannot silently disappear. */
export function unfinishedConsults(): UnfinishedConsult[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM Consult
       WHERE signedAt IS NULL
         AND (audioPath IS NOT NULL OR transcript IS NOT NULL
              OR workingJson IS NOT NULL OR draftJson IS NOT NULL)
       ORDER BY createdAt DESC LIMIT 20`
    )
    .all() as Consult[];

  return rows
    .map((c) => {
      const patient = getPatient(c.patientId);
      if (!patient) return null;
      let reason = "Started but not signed";
      if (c.recordingStartedAt && !c.recordingEndedAt) reason = "Recording was interrupted";
      else if (c.workingJson) reason = "Unsigned note with your edits";
      else if (c.draftJson) reason = "Note drafted, not signed";
      else if (c.transcript) reason = "Transcribed, no note yet";
      else if (c.audioPath) reason = "Audio captured, not transcribed";
      return { ...c, patient, reason };
    })
    .filter(Boolean) as UnfinishedConsult[];
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

export function getQueueEntry(id: string): QueueEntry | undefined {
  return getDb().prepare(`SELECT * FROM QueueEntry WHERE id = ?`).get(id) as QueueEntry | undefined;
}

export function todaysQueue(): QueueRow[] {
  return getDb()
    .prepare(
      `SELECT q.*, p.name AS patientName, p.age AS patientAge, p.sex AS patientSex, p.phone AS patientPhone,
              d.name AS calledByName
       FROM QueueEntry q
       JOIN Patient p ON p.id = q.patientId
       LEFT JOIN User d ON d.id = q.calledBy
       WHERE q.day = ?
       ORDER BY q.token`
    )
    .all(localDay()) as QueueRow[];
}

/**
 * Put a patient on today's list. A patient already waiting or with a doctor
 * keeps their token rather than getting a second one, so a receptionist who
 * adds someone twice does not make them queue twice.
 */
export function addToQueue(patientId: string, addedBy: string | null): { entry: QueueEntry; alreadyQueued: boolean } {
  const tx = getDb().transaction(() => {
    const day = localDay();
    const existing = getDb()
      .prepare(`SELECT * FROM QueueEntry WHERE day = ? AND patientId = ? AND status IN ('waiting', 'with-doctor')`)
      .get(day, patientId) as QueueEntry | undefined;
    if (existing) return { entry: existing, alreadyQueued: true };

    const token = (
      getDb().prepare(`SELECT COALESCE(MAX(token), 0) + 1 AS t FROM QueueEntry WHERE day = ?`).get(day) as { t: number }
    ).t;
    const id = newId();
    getDb()
      .prepare(
        `INSERT INTO QueueEntry (id, patientId, day, token, status, addedBy, addedAt)
         VALUES (?, ?, ?, ?, 'waiting', ?, ?)`
      )
      .run(id, patientId, day, token, addedBy, now());
    return { entry: getQueueEntry(id)!, alreadyQueued: false };
  });
  return tx();
}

/**
 * A doctor calls a waiting patient in. Opens a consultation (or returns the one
 * this doctor already opened) and marks the entry "with doctor", in one
 * transaction so two doctors pressing the button together cannot both take
 * the same patient. Returns null when the patient is no longer theirs to call.
 */
export function startQueueEntry(id: string, doctorId: string): QueueEntry | null {
  const tx = getDb().transaction(() => {
    const e = getQueueEntry(id);
    if (!e || e.day !== localDay()) return null;
    if (e.status === "with-doctor" && e.calledBy === doctorId && e.consultId) return e;
    if (e.status !== "waiting") return null;

    let consultId = e.consultId;
    const existing = consultId ? getConsult(consultId) : undefined;
    if (!existing || existing.signedAt) consultId = createConsult(e.patientId, doctorId).id;

    getDb()
      .prepare(`UPDATE QueueEntry SET status = 'with-doctor', consultId = ?, calledBy = ?, calledAt = ? WHERE id = ?`)
      .run(consultId, doctorId, now(), id);
    return getQueueEntry(id)!;
  });
  return tx();
}

/** The patient went home without being seen. Only a waiting entry can leave. */
export function markQueueLeft(id: string): boolean {
  return (
    getDb()
      .prepare(`UPDATE QueueEntry SET status = 'left', doneAt = ? WHERE id = ? AND status = 'waiting'`)
      .run(now(), id).changes === 1
  );
}

/** Signing the consultation is what marks the patient as seen. */
export function markQueueDoneForConsult(consultId: string) {
  getDb()
    .prepare(`UPDATE QueueEntry SET status = 'done', doneAt = ? WHERE consultId = ? AND status = 'with-doctor'`)
    .run(now(), consultId);
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
  "id, name, username, role, isAdmin, qualification, regNo, active, mustChangePassword, createdAt, lastLoginAt";

/** Admin access follows from the role for staff and admins; only a doctor's is
 *  a separate choice. Normalising here means no row can say "staff, admin". */
function adminFlag(role: Role, isAdmin: boolean): number {
  if (role === "admin") return 1;
  if (role === "staff") return 0;
  return isAdmin ? 1 : 0;
}

export function countUsers(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM User`).get() as { n: number }).n;
}

/** People who can still manage the clinic. Guards against locking everyone out. */
export function countActiveAdmins(): number {
  return (
    getDb().prepare(`SELECT COUNT(*) AS n FROM User WHERE active = 1 AND isAdmin = 1`).get() as { n: number }
  ).n;
}

export function getUserRow(id: string): UserRow | undefined {
  return getDb().prepare(`SELECT * FROM User WHERE id = ?`).get(id) as UserRow | undefined;
}

export function getUserPublic(id: string): PublicUser | undefined {
  return getDb().prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM User WHERE id = ?`).get(id) as PublicUser | undefined;
}

export function getUserByUsername(username: string): UserRow | undefined {
  return getDb().prepare(`SELECT * FROM User WHERE username = ?`).get(username) as UserRow | undefined;
}

export function listUsers(): PublicUser[] {
  return getDb()
    .prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM User ORDER BY active DESC, name COLLATE NOCASE`)
    .all() as PublicUser[];
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

export function createUser(u: NewUser): UserRow {
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO User (id, name, username, role, isAdmin, passwordHash, qualification, regNo,
                         active, mustChangePassword, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
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
  return getUserRow(id)!;
}

/**
 * The first account, created from /setup. The emptiness check and the insert
 * share one transaction, so two browsers submitting setup at the same moment
 * cannot both become the owner.
 */
export function createFirstAccount(u: NewUser, clinicName: string): UserRow | null {
  const tx = getDb().transaction(() => {
    if (countUsers() > 0) return null;
    const user = createUser(u);
    setSettings({ clinic_name: clinicName });
    return user;
  });
  return tx();
}

export type UserPatch = {
  name?: string;
  role?: Role;
  isAdmin?: boolean;
  qualification?: string | null;
  regNo?: string | null;
  active?: boolean;
};

export function updateUser(id: string, patch: UserPatch) {
  const current = getUserRow(id);
  if (!current) return;
  const role = patch.role ?? current.role;
  const isAdmin = adminFlag(role, patch.isAdmin ?? !!current.isAdmin);
  getDb()
    .prepare(
      `UPDATE User SET name = ?, role = ?, isAdmin = ?, qualification = ?, regNo = ?, active = ? WHERE id = ?`
    )
    .run(
      patch.name ?? current.name,
      role,
      isAdmin,
      patch.qualification !== undefined ? patch.qualification : current.qualification,
      patch.regNo !== undefined ? patch.regNo : current.regNo,
      patch.active !== undefined ? (patch.active ? 1 : 0) : current.active,
      id
    );
}

export function setUserPassword(id: string, passwordHash: string, mustChange: boolean) {
  getDb()
    .prepare(`UPDATE User SET passwordHash = ?, mustChangePassword = ? WHERE id = ?`)
    .run(passwordHash, mustChange ? 1 : 0, id);
}

export function touchLogin(id: string) {
  getDb().prepare(`UPDATE User SET lastLoginAt = ? WHERE id = ?`).run(now(), id);
}

/** Put an account back exactly as it was, hash included. Used after restoring a
 *  backup that predates accounts, so the person restoring is not locked out. */
export function reinsertUserRow(row: UserRow) {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO User (id, name, username, role, isAdmin, passwordHash, qualification, regNo,
                                   active, mustChangePassword, createdAt, lastLoginAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
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

export function insertSession(tokenHash: string, userId: string, expiresAt: string) {
  const t = now();
  getDb()
    .prepare(`INSERT INTO Session (tokenHash, userId, createdAt, expiresAt, lastSeenAt) VALUES (?, ?, ?, ?, ?)`)
    .run(tokenHash, userId, t, expiresAt, t);
}

/** A live session and its account. Deactivated accounts and expired sessions
 *  simply do not match, so there is no separate check to forget. */
export function getSessionUser(tokenHash: string): SessionJoin | undefined {
  return getDb()
    .prepare(
      `SELECT s.tokenHash, s.expiresAt, s.lastSeenAt,
              u.id, u.name, u.username, u.role, u.isAdmin, u.qualification, u.regNo, u.mustChangePassword
       FROM Session s JOIN User u ON u.id = s.userId
       WHERE s.tokenHash = ? AND s.expiresAt > ? AND u.active = 1`
    )
    .get(tokenHash, now()) as SessionJoin | undefined;
}

export function touchSession(tokenHash: string, expiresAt: string) {
  getDb().prepare(`UPDATE Session SET lastSeenAt = ?, expiresAt = ? WHERE tokenHash = ?`).run(now(), expiresAt, tokenHash);
}

export function deleteSession(tokenHash: string) {
  getDb().prepare(`DELETE FROM Session WHERE tokenHash = ?`).run(tokenHash);
}

export function deleteSessionsForUser(userId: string, exceptTokenHash: string | null = null) {
  if (exceptTokenHash) {
    getDb().prepare(`DELETE FROM Session WHERE userId = ? AND tokenHash != ?`).run(userId, exceptTokenHash);
  } else {
    getDb().prepare(`DELETE FROM Session WHERE userId = ?`).run(userId);
  }
}

export function pruneExpiredSessions() {
  getDb().prepare(`DELETE FROM Session WHERE expiresAt <= ?`).run(now());
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

export function recordAudit(
  actor: AuditActor,
  action: string,
  targetType: string | null = null,
  targetId: string | null = null,
  detail: string | null = null
) {
  getDb()
    .prepare(
      `INSERT INTO AuditEvent (id, userId, userName, action, targetType, targetId, detail, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(newId(), actor?.id ?? null, actor?.name ?? null, action, targetType, targetId, detail, now());
}

export function listAudit(limit = 300): AuditEvent[] {
  return getDb().prepare(`SELECT * FROM AuditEvent ORDER BY at DESC LIMIT ?`).all(limit) as AuditEvent[];
}

// ---------------------------------------------------------------- settings
export function getSettings(): Record<string, string> {
  const rows = getDb().prepare(`SELECT key, value FROM Setting`).all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSettings(values: Record<string, string>) {
  const stmt = getDb().prepare(
    `INSERT INTO Setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const tx = getDb().transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) stmt.run(k, v);
  });
  tx(Object.entries(values));
}
