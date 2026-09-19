/**
 * The one place that knows which database is underneath.
 *
 *   DATA_BACKEND=sqlite    (default) a single file on the clinic computer
 *   DATA_BACKEND=postgres  the online copy, on Supabase in Mumbai
 *
 * Every query in db.ts is written once, in SQL both databases accept, and runs
 * through q(). The rules that make that work:
 *   - placeholders are `?`; the Postgres side renumbers them to $1, $2 …
 *   - any identifier with a capital letter is double-quoted ("Patient",
 *     "createdAt"), because Postgres folds unquoted names to lowercase and the
 *     rows would come back as patientid
 *   - counts are CAST(... AS INTEGER): Postgres counts are bigints, which the
 *     driver returns as strings
 *   - text comparisons that must ignore case say LOWER() rather than relying on
 *     SQLite's case-insensitive LIKE and COLLATE NOCASE
 *   - timestamps are ISO strings and flags are 0/1 integers in both
 */
import { AsyncLocalStorage } from "node:async_hooks";
import path from "path";
import fs from "fs";
import type BetterSqlite3 from "better-sqlite3";
import type { Sql, TransactionSql } from "postgres";

export type Param = string | number | null | Buffer | Uint8Array;

export interface Q {
  all<T>(sql: string, ...params: Param[]): Promise<T[]>;
  get<T>(sql: string, ...params: Param[]): Promise<T | undefined>;
  /** `changes` is the number of rows the statement touched. */
  run(sql: string, ...params: Param[]): Promise<{ changes: number }>;
}

export type Backend = "sqlite" | "postgres";

/** The clinic every record belonged to before there could be more than one:
 *  the only clinic on a clinic computer, and the first one online. */
export const FIRST_CLINIC = "first";

export const BACKEND: Backend =
  (process.env.DATA_BACKEND || "sqlite").toLowerCase() === "postgres" ? "postgres" : "sqlite";

/** A second insert of the same unique key. Both databases report it differently. */
export function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY";
}

// Queries made inside tx() must use the transaction's connection. Rather than
// threading a handle through every function in db.ts, the open transaction is
// kept here, so a helper called from inside a transaction joins it
// automatically. Without this, Postgres would run that helper on a different
// connection, outside the transaction, and with a pool of one it would wait
// forever for the connection the transaction is holding.
type Open = { q: Q; pg?: TransactionSql };
const current = new AsyncLocalStorage<Open>();

export function q(): Q {
  return current.getStore()?.q ?? base();
}

/**
 * Run fn in one transaction. Nested calls join the outer transaction. Throwing
 * inside fn rolls everything back.
 */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (current.getStore()) return fn();
  return BACKEND === "postgres" ? pgTx(fn) : sqliteTx(fn);
}

/**
 * Inside tx(): run fn so that, if it throws, only what fn did is undone and
 * the transaction carries on. For merging a batch of synced rows, where one
 * row the database refuses must not cost the rest.
 *
 * Postgres needs the driver's own savepoint: postgres.js remembers any failed
 * statement in a transaction and fails the whole transaction at the end, even
 * if the error was caught — unless it failed inside tx.savepoint().
 */
export async function savepoint<T>(fn: () => Promise<T>): Promise<T> {
  const open = current.getStore();
  if (!open) throw new Error("savepoint() only works inside tx().");
  if (open.pg) {
    return (await open.pg.savepoint((sp) => current.run({ q: pgQ(sp), pg: sp }, fn))) as T;
  }
  await open.q.run(`SAVEPOINT clinicos_sp`);
  try {
    const value = await fn();
    await open.q.run(`RELEASE SAVEPOINT clinicos_sp`);
    return value;
  } catch (e) {
    await open.q.run(`ROLLBACK TO SAVEPOINT clinicos_sp`);
    await open.q.run(`RELEASE SAVEPOINT clinicos_sp`);
    throw e;
  }
}

function base(): Q {
  return BACKEND === "postgres" ? pgBase() : sqliteBase();
}

// =============================================================== SQLite
export const DB_PATH = path.resolve(process.env.DB_PATH || "./data/clinicos.db");

const globalForDb = globalThis as unknown as { clinicosDb?: BetterSqlite3.Database; clinicosPg?: Sql };

let sqliteHandle: BetterSqlite3.Database | null = null;

/** The raw SQLite connection, for the backup API. Always call this — never keep
 *  the result, because a restore replaces the underlying connection. */
export function sqlite(): BetterSqlite3.Database {
  if (BACKEND !== "sqlite") throw new Error("This only exists when ClinicOS runs on SQLite.");
  if (!sqliteHandle) sqliteHandle = globalForDb.clinicosDb ?? openSqlite();
  if (process.env.NODE_ENV !== "production") globalForDb.clinicosDb = sqliteHandle;
  return sqliteHandle;
}

/** Reopen after a restore has swapped the file on disk. */
export function reopenSqlite(): void {
  try {
    sqliteHandle?.close();
  } catch {
    /* already closed */
  }
  sqliteHandle = openSqlite();
  if (process.env.NODE_ENV !== "production") globalForDb.clinicosDb = sqliteHandle;
}

// better-sqlite3 answers synchronously, so its statements cannot interleave on
// their own. A transaction can: it awaits between statements, and another
// request's query would land inside it. While one is open, every query from
// outside it waits here.
let sqliteTxOpen: Promise<void> | null = null;

function sqliteQ(db: () => BetterSqlite3.Database, wait: boolean): Q {
  const ready = async () => {
    if (!wait) return;
    while (sqliteTxOpen) await sqliteTxOpen;
  };
  const bind = (params: Param[]) => params.map((p) => (p instanceof Uint8Array && !Buffer.isBuffer(p) ? Buffer.from(p) : p));
  return {
    async all<T>(sql: string, ...params: Param[]) {
      await ready();
      return db().prepare(sql).all(...bind(params)) as T[];
    },
    async get<T>(sql: string, ...params: Param[]) {
      await ready();
      return db().prepare(sql).get(...bind(params)) as T | undefined;
    },
    async run(sql: string, ...params: Param[]) {
      await ready();
      return { changes: db().prepare(sql).run(...bind(params)).changes };
    },
  };
}

let sqliteBaseQ: Q | null = null;
function sqliteBase(): Q {
  return (sqliteBaseQ ??= sqliteQ(sqlite, true));
}

async function sqliteTx<T>(fn: () => Promise<T>): Promise<T> {
  while (sqliteTxOpen) await sqliteTxOpen;
  let release!: () => void;
  sqliteTxOpen = new Promise<void>((r) => (release = r));
  const db = sqlite();
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = await current.run({ q: sqliteQ(sqlite, false) }, fn);
      db.exec("COMMIT");
      return result;
    } catch (e) {
      if (db.inTransaction) db.exec("ROLLBACK");
      throw e;
    }
  } finally {
    sqliteTxOpen = null;
    release();
  }
}

function openSqlite(): BetterSqlite3.Database {
  // Loaded only when SQLite is actually in use, so the online build never needs
  // the native module to load.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof BetterSqlite3;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
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

    -- The day's list at the front desk (v0.5). day is the clinic's local date,
    -- never a UTC date: in India a UTC date would file the first five and a
    -- half hours of every day under yesterday. Tokens restart at 1 each day,
    -- and the unique index makes a duplicate token impossible even if two
    -- desks add a patient at the same instant.
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

    -- A doctor's own saved prescriptions (backlog #15, #16): a name and the
    -- plan part of a note — diagnosis, medicines, tests, advice, follow-up —
    -- never a patient's complaint or findings. Written by each doctor from
    -- their own notes; ClinicOS ships none, because a pre-written treatment
    -- would be clinical advice. One name per doctor, whatever its case.
    CREATE TABLE IF NOT EXISTS Favourite (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      noteJson  TEXT NOT NULL,
      useCount  INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_favourite_name ON Favourite(userId, LOWER(name));
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
  addColumn("Consult", "transcribedAt", "TEXT");    // speed pass (#3): when the transcript arrived
  addColumn("Consult", "draftedAt", "TEXT");        // speed pass (#3): when the AI draft arrived

  // Clinics as tenants (19 Sep 2026). Online, one database holds many clinics
  // and every record says whose it is. The clinic computer holds one clinic,
  // FIRST_CLINIC, which every existing row belongs to by default — so an
  // upgraded pilot database keeps every record exactly where it was. The table
  // is called Tenant because the patient portal already owns a "Clinic" table
  // in the online database. Its twin is migrations/pg/004_tenants.sql.
  for (const table of ["Patient", "Consult", "Edit", "User", "QueueEntry", "Favourite"]) {
    addColumn(table, "clinicId", `TEXT NOT NULL DEFAULT '${FIRST_CLINIC}'`);
  }
  // The log may outlive anything it mentions, so its clinic may be absent: an
  // event about the platform itself belongs to no clinic.
  addColumn("AuditEvent", "clinicId", `TEXT DEFAULT '${FIRST_CLINIC}'`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS Tenant (
      id            TEXT PRIMARY KEY,
      slug          TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      plan          TEXT NOT NULL DEFAULT 'cloud',
      features      TEXT NOT NULL DEFAULT '{}',
      domain        TEXT UNIQUE,
      setupCodeHash TEXT,
      paidUntil     TEXT,
      notes         TEXT,
      createdAt     TEXT NOT NULL,
      updatedAt     TEXT NOT NULL
    );
    INSERT INTO Tenant (id, slug, name, createdAt, updatedAt)
      VALUES ('${FIRST_CLINIC}', '${FIRST_CLINIC}', 'This clinic', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT DO NOTHING;

    -- Clinic details per clinic. Setting (above) was one clinic's, keyed by
    -- name alone; it is copied here once and then left alone, so an older copy
    -- of the app reading it still finds what it expects.
    CREATE TABLE IF NOT EXISTS ClinicSetting (
      clinicId TEXT NOT NULL,
      key      TEXT NOT NULL,
      value    TEXT NOT NULL,
      PRIMARY KEY (clinicId, key)
    );
    INSERT INTO ClinicSetting (clinicId, key, value)
      SELECT '${FIRST_CLINIC}', key, value FROM Setting
      WHERE NOT EXISTS (SELECT 1 FROM ClinicSetting)
      ON CONFLICT DO NOTHING;

    CREATE INDEX IF NOT EXISTS idx_patient_clinic ON Patient(clinicId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_consult_clinic ON Consult(clinicId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_edit_clinic ON Edit(clinicId);
    CREATE INDEX IF NOT EXISTS idx_audit_clinic ON AuditEvent(clinicId, at);
    -- Tokens restart at 1 each day in each clinic.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_clinic_token ON QueueEntry(clinicId, day, token);
    DROP INDEX IF EXISTS idx_queue_token;
  `);

  migrateSyncTracking(db, addColumn);
  return db;
}

/**
 * Keeping a clinic computer in step with its clinic online (19 Sep 2026), for
 * clinics whose plan includes it. The twin of migrations/pg/005_sync.sql.
 *
 * Every row that can travel carries updatedAt (when it last changed, which
 * decides which copy wins when both changed) and syncSeq (a counter that only
 * grows, so "what changed since the last push" never depends on this
 * computer's clock, which a clinic may well have set wrong). Triggers keep
 * both up to date, so no query in db.ts has to remember to. While changes that
 * came from online are being written, SyncState.applying is 1 and the triggers
 * stand aside: those changes are not this computer's to send back.
 *
 * A deleted patient or favourite leaves a tombstone, so the deletion travels
 * too — an erasure request must reach every copy.
 *
 * Nothing here sends anything anywhere. Until the clinic connects this
 * computer with a key from its online clinic, the counters simply count.
 */
function migrateSyncTracking(db: BetterSqlite3.Database, addColumn: (t: string, c: string, d: string) => void) {
  const withUpdatedAt = ["Patient", "Consult", "User", "QueueEntry", "ClinicSetting"]; // Favourite already has it
  const tracked = ["Patient", "Consult", "Edit", "User", "QueueEntry", "Favourite", "AuditEvent", "ClinicSetting"];
  for (const t of withUpdatedAt) addColumn(t, "updatedAt", "TEXT");
  for (const t of tracked) addColumn(t, "syncSeq", "INTEGER");

  const now = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
  const applying = `(SELECT applying FROM SyncState WHERE id = 1) = 0`;
  const bump = `UPDATE SyncState SET seq = seq + 1 WHERE id = 1;`;
  const seq = `(SELECT seq FROM SyncState WHERE id = 1)`;

  let ddl = `
    CREATE TABLE IF NOT EXISTS SyncState (
      id       INTEGER PRIMARY KEY CHECK (id = 1),
      seq      INTEGER NOT NULL DEFAULT 0,
      applying INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO SyncState (id) VALUES (1) ON CONFLICT DO NOTHING;
    -- A crash in the middle of writing changes from online must not leave the
    -- triggers switched off for good.
    UPDATE SyncState SET applying = 0 WHERE id = 1 AND applying <> 0;

    CREATE TABLE IF NOT EXISTS SyncTombstone (
      id        TEXT PRIMARY KEY,
      clinicId  TEXT NOT NULL,
      tableName TEXT NOT NULL,
      rowId     TEXT NOT NULL,
      deletedAt TEXT NOT NULL,
      syncSeq   INTEGER
    );

    -- This computer's side of the connection: the online address, its key,
    -- how far each table has been sent and fetched, and how the last attempt
    -- went. Never sent anywhere, and no triggers: it is bookkeeping, not a record.
    CREATE TABLE IF NOT EXISTS SyncConfig (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;
  for (const t of tracked) {
    const stampUpdated = withUpdatedAt.includes(t) || t === "Favourite";
    ddl += `
    CREATE TRIGGER IF NOT EXISTS sync_${t}_ins AFTER INSERT ON ${t} WHEN ${applying}
    BEGIN
      ${bump}
      UPDATE ${t} SET syncSeq = ${seq}${stampUpdated ? `, updatedAt = COALESCE(NEW.updatedAt, ${now})` : ""}
      WHERE rowid = NEW.rowid;
    END;
    CREATE TRIGGER IF NOT EXISTS sync_${t}_upd AFTER UPDATE ON ${t} WHEN ${applying} AND NEW.syncSeq IS OLD.syncSeq
    BEGIN
      ${bump}
      UPDATE ${t} SET syncSeq = ${seq}${
        stampUpdated ? `, updatedAt = CASE WHEN NEW.updatedAt IS OLD.updatedAt THEN ${now} ELSE NEW.updatedAt END` : ""
      }
      WHERE rowid = NEW.rowid;
    END;`;
  }
  for (const t of ["Patient", "Favourite"]) {
    ddl += `
    CREATE TRIGGER IF NOT EXISTS sync_${t}_del AFTER DELETE ON ${t} WHEN ${applying}
    BEGIN
      ${bump}
      INSERT INTO SyncTombstone (id, clinicId, tableName, rowId, deletedAt, syncSeq)
      VALUES (OLD.clinicId || ':${t}:' || OLD.id, OLD.clinicId, '${t}', OLD.id, ${now}, ${seq})
      ON CONFLICT (id) DO UPDATE SET deletedAt = excluded.deletedAt, syncSeq = excluded.syncSeq;
    END;`;
  }
  // Rows from before tracking get their first stamp. A no-op on every later
  // start: only rows that have never been stamped match.
  for (const t of ["Patient", "Consult", "User", "QueueEntry"]) {
    const from = t === "QueueEntry" ? "addedAt" : "createdAt";
    ddl += `\n    UPDATE ${t} SET updatedAt = ${from} WHERE updatedAt IS NULL;`;
  }
  ddl += `
    UPDATE ClinicSetting SET updatedAt = ${now} WHERE updatedAt IS NULL;
    UPDATE Favourite SET clinicId = clinicId WHERE syncSeq IS NULL;
    UPDATE Edit SET clinicId = clinicId WHERE syncSeq IS NULL;
    UPDATE AuditEvent SET clinicId = clinicId WHERE syncSeq IS NULL;
  `;
  db.exec(ddl);
}


// ============================================================= Postgres
function pgClient(): Sql {
  if (globalForDb.clinicosPg) return globalForDb.clinicosPg;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATA_BACKEND=postgres but DATABASE_URL is not set.");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const postgres = require("postgres") as typeof import("postgres");
  const client = postgres(url, {
    // Supabase's transaction pooler hands each query a different backend
    // connection, so a prepared statement made by one query is not there for
    // the next. Required, not a tuning choice.
    prepare: false,
    // A local test server has no TLS; Supabase refuses anything without it.
    ssl: /sslmode=disable/.test(url) ? false : "require",
    // Each serverless instance keeps a few connections; the pooler shares them.
    max: Number(process.env.PG_POOL_MAX) || 3,
    idle_timeout: 20,
    // Integers come back as numbers. Nothing here is near 2^53.
    types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
  });
  // Kept across hot reloads and across requests in one serverless instance.
  globalForDb.clinicosPg = client;
  return client;
}

/** `?` → `$1, $2 …`, skipping anything inside quotes. */
function numbered(sql: string): string {
  let n = 0;
  let out = "";
  let quote: string | null = null;
  for (const ch of sql) {
    if (quote) {
      if (ch === quote) quote = null;
      out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === "?") {
      out += `$${++n}`;
    } else {
      out += ch;
    }
  }
  return out;
}

function pgQ(sql: Sql | TransactionSql): Q {
  const exec = async (text: string, params: Param[]) =>
    sql.unsafe(numbered(text), params as never[], { prepare: false });
  return {
    async all<T>(text: string, ...params: Param[]) {
      return [...(await exec(text, params))] as T[];
    },
    async get<T>(text: string, ...params: Param[]) {
      const rows = await exec(text, params);
      return rows[0] as T | undefined;
    },
    async run(text: string, ...params: Param[]) {
      const rows = await exec(text, params);
      return { changes: rows.count ?? 0 };
    },
  };
}

let pgBaseQ: Q | null = null;
function pgBase(): Q {
  return (pgBaseQ ??= pgQ(pgClient()));
}

async function pgTx<T>(fn: () => Promise<T>): Promise<T> {
  return (await pgClient().begin((t) => current.run({ q: pgQ(t), pg: t }, fn))) as T;
}

/** Close the pool, for scripts that must exit. */
export async function closeDatabase(): Promise<void> {
  if (BACKEND === "postgres" && globalForDb.clinicosPg) {
    await globalForDb.clinicosPg.end({ timeout: 5 });
    globalForDb.clinicosPg = undefined;
    pgBaseQ = null;
  }
}
