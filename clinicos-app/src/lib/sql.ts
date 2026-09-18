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
const current = new AsyncLocalStorage<Q>();

export function q(): Q {
  return current.getStore() ?? base();
}

/**
 * Run fn in one transaction. Nested calls join the outer transaction. Throwing
 * inside fn rolls everything back.
 */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (current.getStore()) return fn();
  return BACKEND === "postgres" ? pgTx(fn) : sqliteTx(fn);
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
      const result = await current.run(sqliteQ(sqlite, false), fn);
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

  return db;
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
  return (await pgClient().begin((t) => current.run(pgQ(t), fn))) as T;
}

/** Close the pool, for scripts that must exit. */
export async function closeDatabase(): Promise<void> {
  if (BACKEND === "postgres" && globalForDb.clinicosPg) {
    await globalForDb.clinicosPg.end({ timeout: 5 });
    globalForDb.clinicosPg = undefined;
    pgBaseQ = null;
  }
}
