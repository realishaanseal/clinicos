import type BetterSqlite3 from "better-sqlite3";
import { BACKEND, DB_PATH, reopenSqlite, sqlite } from "./sql";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || "./data/backups");
const KEEP = 14;

/**
 * Backup files are copies of the SQLite database on the clinic computer. The
 * online copy runs on Postgres, where there is no such file to copy or swap,
 * so these tools stand down there and say so; "Export everything" still works
 * everywhere.
 */
export const BACKUP_FILES_AVAILABLE = BACKEND === "sqlite";
const ONLINE_MESSAGE =
  "Backup files are for ClinicOS on the clinic computer. The online copy keeps its records in a hosted database; use Export everything to take a full copy.";

export type BackupFile = {
  name: string;
  bytes: number;
  createdAt: string;
  auto: boolean;
};

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Write a consistent copy of the database.
 *
 * This uses SQLite's online backup API rather than copying the file, and that
 * distinction is the whole feature. The database runs in WAL mode, so recent
 * writes live in a separate -wal file that has not been merged in yet. A plain
 * `cp clinicos.db backup.db` produces a file that looks fine, opens fine, and
 * is quietly missing the most recent consultations — the exact ones you would
 * most want back. The backup API takes a proper snapshot, and it is safe to
 * run while the app is being used.
 */
export async function createBackup(auto = false): Promise<BackupFile> {
  if (!BACKUP_FILES_AVAILABLE) throw new Error(ONLINE_MESSAGE);
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const name = `clinicos_${stamp()}${auto ? "_auto" : ""}.db`;
  const dest = path.join(BACKUP_DIR, name);

  await sqlite().backup(dest);

  const st = await fsp.stat(dest);
  if (auto) await prune();

  return { name, bytes: st.size, createdAt: new Date().toISOString(), auto };
}

export async function listBackups(): Promise<BackupFile[]> {
  if (!BACKUP_FILES_AVAILABLE) return [];
  try {
    const names = await fsp.readdir(BACKUP_DIR);
    const files = await Promise.all(
      names
        .filter((n) => n.endsWith(".db"))
        .map(async (n) => {
          const st = await fsp.stat(path.join(BACKUP_DIR, n));
          return {
            name: n,
            bytes: st.size,
            createdAt: st.mtime.toISOString(),
            auto: n.includes("_auto"),
          };
        })
    );
    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function prune() {
  const all = await listBackups();
  const autos = all.filter((b) => b.auto).slice(KEEP);
  for (const b of autos) {
    try {
      await fsp.unlink(path.join(BACKUP_DIR, b.name));
    } catch {
      /* ignore */
    }
  }
}

/** Run at most one automatic backup a day. Called on page load rather than
 *  from a scheduler, because a scheduler is one more thing that can be off. */
export async function maybeAutoBackup(): Promise<void> {
  if (!BACKUP_FILES_AVAILABLE) return;
  try {
    const all = await listBackups();
    const last = all[0];
    if (last) {
      const age = Date.now() - new Date(last.createdAt).getTime();
      if (age < 20 * 60 * 60 * 1000) return;
    }
    await createBackup(true);
  } catch {
    /* a failed automatic backup must never break the app */
  }
}

export type RestoreResult = {
  ok: boolean;
  error?: string;
  safetyCopy?: string;
  counts?: { patients: number; consults: number; edits: number };
};

/**
 * Replace the live database with an uploaded backup.
 *
 * Order matters and every step is a guard:
 *   1. write to a temp file and open it read-only — never trust the upload
 *   2. verify it is really a ClinicOS database, not any old SQLite file
 *   3. snapshot the CURRENT database first, so a mistaken restore is undoable
 *   4. only then close the live connection and swap the file
 */
export async function restoreFromBuffer(buf: Buffer): Promise<RestoreResult> {
  if (!BACKUP_FILES_AVAILABLE) return { ok: false, error: ONLINE_MESSAGE };
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const tmp = path.join(BACKUP_DIR, `.incoming_${Date.now()}.db`);

  try {
    await fsp.writeFile(tmp, buf);

    // --- 1 & 2: is this actually one of ours? -------------------------------
    let counts: { patients: number; consults: number; edits: number };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require("better-sqlite3") as typeof BetterSqlite3;
      const probe = new Database(tmp, { readonly: true, fileMustExist: true });
      const tables = new Set(
        (probe.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[])
          .map((r) => r.name)
      );
      for (const required of ["Patient", "Consult", "Edit"]) {
        if (!tables.has(required)) {
          probe.close();
          return { ok: false, error: `This file is not a ClinicOS backup — the "${required}" table is missing.` };
        }
      }
      counts = {
        patients: (probe.prepare(`SELECT COUNT(*) n FROM Patient`).get() as { n: number }).n,
        consults: (probe.prepare(`SELECT COUNT(*) n FROM Consult`).get() as { n: number }).n,
        edits: (probe.prepare(`SELECT COUNT(*) n FROM Edit`).get() as { n: number }).n,
      };
      probe.close();
    } catch {
      return { ok: false, error: "This file is not a readable SQLite database." };
    }

    // --- 3: snapshot what is about to be replaced --------------------------
    const safetyName = `clinicos_${stamp()}_before-restore.db`;
    await sqlite().backup(path.join(BACKUP_DIR, safetyName));

    // --- 4: swap ------------------------------------------------------------
    sqlite().close();
    for (const suffix of ["-wal", "-shm"]) {
      try {
        await fsp.unlink(DB_PATH + suffix);
      } catch {
        /* not present */
      }
    }
    await fsp.copyFile(tmp, DB_PATH);
    reopenSqlite();

    return { ok: true, safetyCopy: safetyName, counts };
  } catch (e) {
    // Attempt to get the app back on its feet whatever happened.
    try {
      reopenSqlite();
    } catch {
      /* the restart instruction in the UI covers this */
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    try {
      await fsp.unlink(tmp);
    } catch {
      /* ignore */
    }
  }
}

export function backupPathFor(name: string): string | null {
  // Never let a name escape the backup directory.
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  const p = path.join(BACKUP_DIR, name);
  if (!p.startsWith(BACKUP_DIR)) return null;
  return fs.existsSync(p) ? p : null;
}
