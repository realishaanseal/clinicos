// Builds a prototype-era ClinicOS database — the schema from before accounts
// existed — with sample records, so the tests can prove an upgrade changes
// nothing that was already there.
//
//   node scripts/test/seed-pre-v1.cjs <new.db> <fingerprint.json> <pre-v1-copy.db>
//
// <pre-v1-copy.db> is a backup of the seeded database taken before any v1 code
// opens it, used by admin-tools-test to restore a pre-accounts backup.
const Database = require("better-sqlite3");
const fs = require("fs");

const [dbPath, fingerprintPath, preV1CopyPath] = process.argv.slice(2);
if (!dbPath || !fingerprintPath || !preV1CopyPath) {
  console.error("Usage: node seed-pre-v1.cjs <new.db> <fingerprint.json> <pre-v1-copy.db>");
  process.exit(1);
}
if (fs.existsSync(dbPath)) {
  console.error(`${dbPath} already exists. The seed only writes a brand-new database.`);
  process.exit(1);
}

const db = new Database(dbPath);

// Exactly what the prototype created, including the four columns it later
// added with ALTER TABLE.
db.exec(`
  CREATE TABLE Patient (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, age INTEGER, sex TEXT, phone TEXT,
    guardianName TEXT, createdAt TEXT NOT NULL
  );
  CREATE INDEX idx_patient_name ON Patient(name);
  CREATE TABLE Consult (
    id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES Patient(id) ON DELETE CASCADE,
    consentGiven INTEGER NOT NULL DEFAULT 0, consentAt TEXT, consentBy TEXT,
    audioPath TEXT, audioBytes INTEGER, audioSeconds REAL, audioDeletedAt TEXT,
    transcript TEXT, asrModel TEXT, asrSeconds REAL, draftJson TEXT, finalJson TEXT,
    llmModel TEXT, llmSeconds REAL, signedAt TEXT, createdAt TEXT NOT NULL
  );
  CREATE INDEX idx_consult_patient ON Consult(patientId);
  CREATE INDEX idx_consult_created ON Consult(createdAt);
  CREATE TABLE Edit (
    id TEXT PRIMARY KEY, consultId TEXT NOT NULL REFERENCES Consult(id) ON DELETE CASCADE,
    field TEXT NOT NULL, before TEXT NOT NULL, after TEXT NOT NULL, createdAt TEXT NOT NULL
  );
  CREATE INDEX idx_edit_consult ON Edit(consultId);
  ALTER TABLE Consult ADD COLUMN workingJson TEXT;
  ALTER TABLE Consult ADD COLUMN workingSavedAt TEXT;
  ALTER TABLE Consult ADD COLUMN recordingStartedAt TEXT;
  ALTER TABLE Consult ADD COLUMN recordingEndedAt TEXT;
`);

const note = (dx) =>
  JSON.stringify({
    chiefComplaint: "Fever for three days",
    history: "No travel. Eating less.",
    examination: "Temperature 101F. Throat congested.",
    diagnosis: dx,
    medications: [
      { name: "Paracetamol", dose: "650mg", frequency: "TDS", duration: "3 days", instructions: "After food" },
    ],
    investigations: ["CBC"],
    advice: "Plenty of fluids",
    followUp: "Review in 3 days if fever persists",
  });

function insertConsult(c) {
  const keys = Object.keys(c);
  db.prepare(`INSERT INTO Consult (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(
    ...keys.map((k) => c[k])
  );
}

db.transaction(() => {
  const addPatient = db.prepare(
    `INSERT INTO Patient (id, name, age, sex, phone, guardianName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  addPatient.run("seedpatient1", "Seed Patient One", 40, "F", "9000000001", null, "2026-09-01T09:55:00.000Z");
  addPatient.run("seedpatient2", "Seed Patient Two", 9, "M", null, "Seed Guardian", "2026-09-03T09:55:00.000Z");

  // Signed, with an AI correction logged and audio already deleted.
  insertConsult({
    id: "seedconsult1",
    patientId: "seedpatient1",
    consentGiven: 1,
    consentAt: "2026-09-01T10:00:00.000Z",
    consentBy: "staff",
    transcript: "Doctor: How long has the fever been there? Patient: Three days.",
    draftJson: note("Viral fever"),
    finalJson: note("Viral fever, resolving"),
    signedAt: "2026-09-01T10:20:00.000Z",
    audioDeletedAt: "2026-09-01T10:20:00.000Z",
    createdAt: "2026-09-01T10:00:00.000Z",
  });
  // Drafted but not signed — proves only a doctor can sign after v1.
  insertConsult({
    id: "seedconsult2",
    patientId: "seedpatient1",
    consentGiven: 1,
    consentAt: "2026-09-02T10:00:00.000Z",
    consentBy: "staff",
    transcript: "Doctor: Any stomach pain? Patient: Burning after meals.",
    draftJson: note("Gastritis"),
    createdAt: "2026-09-02T10:00:00.000Z",
  });
  // No consent — the audio endpoints must keep refusing it.
  insertConsult({ id: "seedconsult3", patientId: "seedpatient2", consentGiven: 0, createdAt: "2026-09-03T10:00:00.000Z" });

  db.prepare(
    `INSERT INTO Edit (id, consultId, field, before, after, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
  ).run("seededit1", "seedconsult1", "diagnosis", "Viral fever", "Viral fever, resolving", "2026-09-01T10:20:00.000Z");
})();

const fingerprint = {
  patients: db.prepare(`SELECT * FROM Patient ORDER BY id`).all(),
  consults: db
    .prepare(
      `SELECT id, patientId, consentGiven, consentAt, consentBy, transcript, draftJson, finalJson,
              signedAt, audioDeletedAt, createdAt
       FROM Consult ORDER BY id`
    )
    .all(),
  edits: db.prepare(`SELECT * FROM Edit ORDER BY id`).all(),
};
fs.writeFileSync(fingerprintPath, JSON.stringify(fingerprint, null, 1));

(async () => {
  // SQLite's backup API, as everywhere else in ClinicOS — never a file copy.
  await db.backup(preV1CopyPath);
  db.close();
  console.log(
    `seeded ${fingerprint.patients.length} patients, ${fingerprint.consults.length} consultations, ${fingerprint.edits.length} edits`
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
