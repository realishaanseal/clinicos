// Applies the numbered .sql files in migrations/ that have not run yet.
//
// Safe to re-run: a file is recorded in "_migration" only once it succeeds, and
// each one runs inside a transaction, so a failure leaves nothing half-applied.
// Run it with `npm run migrate` from the portal folder.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = join(root, "migrations");

// Locally the connection string lives in .env.local, which git ignores. On
// Vercel there is no such file and the same names arrive as real env vars.
const envFile = join(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    "There is no DATABASE_URL, so there is nothing to connect to.\n\n" +
      "Copy .env.example to .env.local and paste the Supabase connection string\n" +
      "into it — the transaction pooler one, with pooler.supabase.com and port 6543.",
  );
  process.exit(1);
}

if (url.includes("<") || url.includes("[YOUR-PASSWORD]")) {
  console.error(
    "DATABASE_URL in .env.local is still the example, not a real connection string.\n\n" +
      "In the Supabase dashboard press Connect, choose Transaction pooler, and paste\n" +
      "that string in. Then put the database password you saved when the project was\n" +
      "created in place of the password placeholder it comes with.",
  );
  process.exit(1);
}

// prepare: false is required. Supabase's transaction pooler hands each query a
// different backend connection, so a prepared statement made by one query is
// not there for the next.
let sql;

try {
  sql = postgres(url, {
    prepare: false,
    ssl: "require",
    max: 1,
    // Postgres raises a NOTICE for every `create ... if not exists` that finds
    // the object already there, which is every run after the first. Printed
    // raw it reads like a failure. Anything that is not that is worth seeing.
    onnotice: (notice) => {
      if (notice.code !== "42P07") console.log(notice.message);
    },
  });

  await sql`
    create table if not exists "_migration" (
      "name"      text primary key,
      "appliedAt" timestamptz not null default now()
    )
  `;

  const done = new Set((await sql`select "name" from "_migration"`).map((row) => row.name));
  const files = readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) {
      console.log(`  already applied   ${file}`);
      continue;
    }
    const text = readFileSync(join(migrations, file), "utf8");
    // simple: true sends the file as one multi-statement query. The extended
    // protocol would only accept a single statement per call.
    await sql.begin(async (tx) => {
      await tx.unsafe(text, [], { simple: true });
      await tx`insert into "_migration" ("name") values (${file})`;
    });
    console.log(`  applied           ${file}`);
    applied += 1;
  }

  console.log(applied === 0 ? "\nUp to date — nothing to apply." : `\nApplied ${applied}.`);
} catch (error) {
  console.error(`\nThe migration stopped and nothing was left half-applied.\n\n${error.message}`);
  if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
    console.error(
      "\nThat looks like the database could not be reached. A free Supabase\n" +
        "project pauses after a week of no activity — open the dashboard and\n" +
        "resume it, then run this again.",
    );
  }
  process.exitCode = 1;
} finally {
  if (sql) await sql.end();
}
