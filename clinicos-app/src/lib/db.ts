/**
 * Storage. Plain SQLite, no ORM.
 *
 * A single file at ./data/clinicos.db. Copy it to back up; delete it to reset.
 * When you eventually deploy, this is the layer you replace — everything above
 * it talks to the functions exported here, not to SQL.
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
  `);

  // Columns added after the first release. SQLite has no "ADD COLUMN IF NOT
  // EXISTS", so check what is already there. Existing pilot databases must
  // survive an upgrade untouched — never drop and recreate.
  const have = new Set(
    (db.prepare(`PRAGMA table_info(Consult)`).all() as { name: string }[]).map((c) => c.name)
  );
  const add = (col: string, decl: string) => {
    if (have.has(col)) return;
    try {
      db.exec(`ALTER TABLE Consult ADD COLUMN ${col} ${decl}`);
    } catch (e) {
      // `have` is a snapshot taken before this loop, so another process can add
      // the column in between and make it stale. That is not hypothetical:
      // `next build` collects page data in parallel workers, each of which
      // imports this module and runs these migrations against the same file.
      // SQLite has no "ADD COLUMN IF NOT EXISTS", so losing the race is benign
      // — the column exists, which is all we wanted. Anything else is real.
      if (!/duplicate column name/i.test(String((e as Error)?.message))) throw e;
    }
  };
  add("workingJson", "TEXT");      // the doctor's in-progress edits, autosaved
  add("workingSavedAt", "TEXT");
  add("recordingStartedAt", "TEXT");
  add("recordingEndedAt", "TEXT"); // null while a recording is still open

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
 *  clinic's records survive even if this app does not. */
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

export function searchPatients(q: string): (Patient & { consultCount: number })[] {
  const sql = q
    ? `SELECT p.*, (SELECT COUNT(*) FROM Consult c WHERE c.patientId = p.id) AS consultCount
       FROM Patient p WHERE p.name LIKE ? ORDER BY p.createdAt DESC LIMIT 50`
    : `SELECT p.*, (SELECT COUNT(*) FROM Consult c WHERE c.patientId = p.id) AS consultCount
       FROM Patient p ORDER BY p.createdAt DESC LIMIT 50`;
  const stmt = getDb().prepare(sql);
  return (q ? stmt.all(`%${q}%`) : stmt.all()) as (Patient & { consultCount: number })[];
}

// ---------------------------------------------------------------- consults
export function createConsult(patientId: string): Consult {
  const id = newId();
  getDb().prepare(`INSERT INTO Consult (id, patientId, createdAt) VALUES (?, ?, ?)`).run(id, patientId, now());
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

export function signConsult(id: string, finalJson: string, audioDeleted: boolean) {
  getDb().prepare(
    `UPDATE Consult
     SET finalJson = ?, signedAt = ?, audioPath = NULL, audioDeletedAt = ?,
         workingJson = NULL, recordingEndedAt = COALESCE(recordingEndedAt, ?)
     WHERE id = ?`
  ).run(finalJson, now(), audioDeleted ? now() : null, now(), id);
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
  const day = new Date().toISOString().slice(0, 10);
  return (
    getDb().prepare(`SELECT COUNT(*) AS n FROM Consult WHERE substr(createdAt, 1, 10) = ?`).get(day) as {
      n: number;
    }
  ).n;
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
 * Consults and edits cascade via foreign keys. Audio paths are returned so the
 * caller can unlink the files — the database cannot delete anything on disk.
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
    getDb().prepare(`DELETE FROM Patient WHERE id = ?`).run(id); // cascades to Consult -> Edit
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
