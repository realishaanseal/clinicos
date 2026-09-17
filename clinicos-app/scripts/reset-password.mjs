#!/usr/bin/env node
/**
 * Reset a ClinicOS account's password, from the clinic computer itself.
 *
 *   npm run reset-password -- <username>
 *
 * For the day the only person who manages the clinic forgets their password.
 * Nobody else can reset it in the app, so the fallback is physical access to
 * the machine the records live on — that is already the trust boundary.
 *
 * Prints a temporary password. The person must choose a new one when they sign
 * in. The account is reactivated if it had been deactivated, every session for
 * it is ended, and the reset is written to the activity log.
 *
 * For the online copy, run it on any computer with the online database's
 * connection string:
 *
 *   DATA_BACKEND=postgres DATABASE_URL="…" npm run reset-password -- <username>
 *
 * The hash format must match hashPassword() in src/lib/auth.ts.
 */
import { randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const username = String(process.argv[2] || "").trim().toLowerCase();
if (!username) {
  console.error("Usage: npm run reset-password -- <username>");
  process.exit(1);
}

function dbPathFromEnvFile() {
  try {
    const m = fs.readFileSync(".env", "utf8").match(/^DB_PATH\s*=\s*"?([^"\r\n]*)"?/m);
    return m?.[1] || undefined;
  } catch {
    return undefined;
  }
}

// Same alphabet and sampling as generateTempPassword() in src/lib/auth.ts.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
let temp = "";
while (temp.length < 10) {
  for (const b of randomBytes(20)) {
    if (b >= 248) continue;
    temp += ALPHABET[b % ALPHABET.length];
    if (temp.length === 10) break;
  }
}

const N = 32768, r = 8, p = 1;
const salt = randomBytes(16);
const key = scryptSync(temp, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
const hash = `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
const now = new Date().toISOString();
const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);


const online = (process.env.DATA_BACKEND || "").toLowerCase() === "postgres";

if (online) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATA_BACKEND=postgres needs DATABASE_URL, the online database's connection string.");
    process.exit(1);
  }
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { prepare: false, ssl: /sslmode=disable/.test(url) ? false : "require", max: 1 });
  try {
    const [user] = await sql`select "id", "name" from "User" where lower("username") = ${username}`;
    if (!user) {
      const all = (await sql`select "username" from "User" order by "username"`).map((u) => u.username);
      console.error(`No account called "${username}". Accounts here: ${all.join(", ") || "(none)"}`);
      process.exitCode = 1;
    } else {
      await sql.begin(async (tx) => {
        await tx`update "User" set "passwordHash" = ${hash}, "mustChangePassword" = 1, "active" = 1 where "id" = ${user.id}`;
        await tx`delete from "Session" where "userId" = ${user.id}`;
        await tx`insert into "AuditEvent" ("id", "userId", "userName", "action", "targetType", "targetId", "detail", "at")
                 values (${id}, null, 'reset-password script', 'user_password_reset', 'user', ${user.id},
                         ${`${user.name}, reset with the reset-password script`}, ${now})`;
      });
      console.log(`\nTemporary password for ${user.name}:  ${temp}\n`);
      console.log("They will be asked to choose their own password when they sign in.\n");
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  process.exit();
}

const dbPath = path.resolve(process.env.DB_PATH || dbPathFromEnvFile() || "./data/clinicos.db");
if (!fs.existsSync(dbPath)) {
  console.error(`No ClinicOS database at ${dbPath}. Run this from the clinicos-app folder.`);
  process.exit(1);
}

const { default: Database } = await import("better-sqlite3");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const hasUsers = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'User'`).get();
if (!hasUsers) {
  console.error("This database has no accounts yet. Open ClinicOS and complete setup instead.");
  process.exit(1);
}

const user = db.prepare(`SELECT id, name FROM User WHERE username = ?`).get(username);
if (!user) {
  const all = db.prepare(`SELECT username FROM User ORDER BY username`).all().map((u) => u.username);
  console.error(`No account called "${username}". Accounts here: ${all.join(", ") || "(none)"}`);
  process.exit(1);
}

db.transaction(() => {
  db.prepare(`UPDATE User SET passwordHash = ?, mustChangePassword = 1, active = 1 WHERE id = ?`).run(hash, user.id);
  db.prepare(`DELETE FROM Session WHERE userId = ?`).run(user.id);
  db.prepare(
    `INSERT INTO AuditEvent (id, userId, userName, action, targetType, targetId, detail, at)
     VALUES (?, NULL, ?, 'user_password_reset', 'user', ?, ?, ?)`
  ).run(id, "reset-password script", user.id, `${user.name}, reset at the clinic computer`, now);
})();

db.close();
console.log(`\nTemporary password for ${user.name}:  ${temp}\n`);
console.log("They will be asked to choose their own password when they sign in.\n");
