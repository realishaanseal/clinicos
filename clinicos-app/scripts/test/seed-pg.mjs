// The Postgres counterpart of seed-pre-v1.cjs. It does not invent its own
// sample data: it takes the SQLite database that seed built and copies its
// patients, consultations and edits into a freshly migrated Postgres, so both
// test runs start from identical records and compare against one fingerprint.
//
//   node scripts/test/seed-pg.mjs <seeded.sqlite.db>
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..", "..");

const [sqlitePath] = process.argv.slice(2);
const url = process.env.DATABASE_URL;

const migrate = spawnSync(process.execPath, [path.join(appDir, "scripts", "migrate-pg.mjs")], { env: process.env, stdio: "inherit" });
if (migrate.status !== 0) process.exit(1);

const src = new Database(sqlitePath, { readonly: true });
const sql = postgres(url, { prepare: false, ssl: false, max: 1 });

try {
  await sql.begin(async (tx) => {
    for (const table of ["Patient", "Consult", "Edit"]) {
      for (const row of src.prepare(`SELECT * FROM ${table}`).all()) {
        await tx`insert into ${tx(table)} ${tx(row)}`;
      }
    }
  });
  const count = async (t) => (await sql`select count(*)::int as n from ${sql(t)}`)[0].n;
  console.log(`Copied ${await count("Patient")} patients, ${await count("Consult")} consultations, ${await count("Edit")} edits into Postgres.`);
} finally {
  src.close();
  await sql.end({ timeout: 5 });
}
