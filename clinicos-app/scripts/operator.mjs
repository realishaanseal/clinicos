#!/usr/bin/env node
/**
 * Varaxis operator accounts, for the platform console at /app/platform.
 *
 *   npm run operator -- add <username> "<Full name>"
 *   npm run operator -- reset <username>
 *   npm run operator -- deactivate <username>
 *
 * There is no screen for making operators, on purpose: an operator can create
 * clinics and change what any clinic has, so making one needs the online
 * database's connection string, which only Varaxis holds. Prints a temporary
 * password; the operator must choose their own (12 characters or more) when
 * they first sign in.
 *
 *   DATABASE_URL="…" npm run operator -- add ishaan "Ishaan Seal"
 *
 * DATABASE_URL comes from the environment, or from .env.local in this folder.
 * The hash format must match hashPassword() in src/lib/auth.ts.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const [command, rawUsername, ...nameParts] = process.argv.slice(2);
const username = String(rawUsername || "").trim().toLowerCase();
const usage = `Usage:
  npm run operator -- add <username> "<Full name>"
  npm run operator -- reset <username>
  npm run operator -- deactivate <username>`;

if (!["add", "reset", "deactivate"].includes(command) || !/^[a-z0-9._-]{3,32}$/.test(username)) {
  console.error(usage);
  process.exit(1);
}
const fullName = nameParts.join(" ").trim();
if (command === "add" && !fullName) {
  console.error(`Give the operator's full name too.\n\n${usage}`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.local");
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) {
  console.error("Operators live in the online database. Set DATABASE_URL to its connection string.");
  process.exit(1);
}

// Same alphabet and sampling as generateTempPassword() in src/lib/auth.ts,
// longer because an operator can change any clinic.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
let temp = "";
while (temp.length < 16) {
  for (const b of randomBytes(32)) {
    if (b >= 248) continue;
    temp += ALPHABET[b % ALPHABET.length];
    if (temp.length === 16) break;
  }
}
const N = 32768, r = 8, p = 1;
const salt = randomBytes(16);
const key = scryptSync(temp, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
const hash = `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
const now = new Date().toISOString();
const newId = () => {
  let rand = "";
  for (const b of randomBytes(10)) rand += (b % 36).toString(36);
  return Date.now().toString(36) + rand;
};

const sql = postgres(url, { prepare: false, ssl: /sslmode=disable/.test(url) ? false : "require", max: 1 });
try {
  const [existing] = await sql`select "id", "name" from "Operator" where lower("username") = ${username}`;
  if (command === "add") {
    if (existing) {
      console.error(`There is already an operator called "${username}". Use reset to give them a new password.`);
      process.exitCode = 1;
    } else {
      const id = newId();
      await sql.begin(async (tx) => {
        await tx`insert into "Operator" ("id", "name", "username", "passwordHash", "active", "mustChangePassword", "createdAt")
                 values (${id}, ${fullName}, ${username}, ${hash}, 1, 1, ${now})`;
        await tx`insert into "AuditEvent" ("id", "clinicId", "userId", "userName", "action", "targetType", "targetId", "detail", "at")
                 values (${newId()}, null, null, 'operator script', 'operator_create', 'operator', ${id}, ${fullName}, ${now})`;
      });
      console.log(`\nOperator ${fullName} (${username}) created.`);
      console.log(`Temporary password:  ${temp}\n`);
      console.log("Sign in at <your address>/app/platform/login and choose a new password.\n");
    }
  } else if (!existing) {
    const all = (await sql`select "username" from "Operator" order by "username"`).map((o) => o.username);
    console.error(`No operator called "${username}". Operators: ${all.join(", ") || "(none)"}`);
    process.exitCode = 1;
  } else if (command === "reset") {
    await sql.begin(async (tx) => {
      await tx`update "Operator" set "passwordHash" = ${hash}, "mustChangePassword" = 1, "active" = 1 where "id" = ${existing.id}`;
      await tx`delete from "OperatorSession" where "operatorId" = ${existing.id}`;
      await tx`insert into "AuditEvent" ("id", "clinicId", "userId", "userName", "action", "targetType", "targetId", "detail", "at")
               values (${newId()}, null, null, 'operator script', 'operator_password_reset', 'operator', ${existing.id}, ${existing.name}, ${now})`;
    });
    console.log(`\nTemporary password for ${existing.name}:  ${temp}\n`);
  } else {
    await sql.begin(async (tx) => {
      await tx`update "Operator" set "active" = 0 where "id" = ${existing.id}`;
      await tx`delete from "OperatorSession" where "operatorId" = ${existing.id}`;
      await tx`insert into "AuditEvent" ("id", "clinicId", "userId", "userName", "action", "targetType", "targetId", "detail", "at")
               values (${newId()}, null, null, 'operator script', 'operator_deactivate', 'operator', ${existing.id}, ${existing.name}, ${now})`;
    });
    console.log(`\n${existing.name} can no longer sign in to the platform console.\n`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
