#!/usr/bin/env node
/**
 * Applies the numbered .sql files in migrations/pg/ that have not run yet, to
 * the online copy's Postgres database.
 *
 *   npm run migrate:pg
 *
 * Safe to re-run: a file is recorded in "_clinic_migration" only once it
 * succeeds, and each runs inside a transaction, so a failure leaves nothing
 * half-applied. The portal keeps its own record in "_migration".
 *
 * DATABASE_URL comes from the environment, or from .env.local in this folder
 * (git-ignored). Use Supabase's transaction pooler string.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "migrations", "pg");
const envFile = join(root, ".env.local");
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) {
  console.error("There is no DATABASE_URL to connect to. Set it, or put it in clinicos-app/.env.local.");
  process.exit(1);
}

const sql = postgres(url, {
  prepare: false,
  ssl: /sslmode=disable/.test(url) ? false : "require",
  max: 1,
  // "already exists" notices on every re-run read like failures; they are not.
  onnotice: (n) => {
    if (n.code !== "42P07") console.log(n.message);
  },
});

try {
  await sql`create table if not exists "_clinic_migration" ("name" text primary key, "appliedAt" timestamptz not null default now())`;
  const done = new Set((await sql`select "name" from "_clinic_migration"`).map((r) => r.name));
  let applied = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) {
      console.log(`  already applied   ${file}`);
      continue;
    }
    const text = readFileSync(join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text, [], { simple: true });
      await tx`insert into "_clinic_migration" ("name") values (${file})`;
    });
    console.log(`  applied           ${file}`);
    applied++;
  }
  console.log(applied ? `\nApplied ${applied}.` : "\nUp to date — nothing to apply.");
} catch (e) {
  console.error(`\nThe migration stopped and nothing was left half-applied.\n\n${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
