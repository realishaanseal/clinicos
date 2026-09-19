#!/usr/bin/env node
/**
 * End-to-end checks for the clinic app, over real HTTP, against a throwaway
 * database. Nothing here touches data/, which holds the clinic's real records.
 *
 *   cd clinicos-app
 *   npm run test:e2e                 build, start, run every suite, stop
 *   npm run test:e2e -- --no-build   reuse the last build
 *   npm run test:e2e:pg              the same suites against Postgres, as the
 *                                    online copy runs (PGlite, nothing to install)
 *
 *   TEST_DATABASE_URL=… npm run test:e2e:pg
 *       the same, against a real Postgres (Supabase) for true concurrency. It
 *       refuses to start unless the clinic tables are empty, and empties them
 *       again afterwards. Never point it at a database holding real records.
 *
 *   TEST_DATABASE_URL=… TEST_BASE_URL=https://…/app TEST_SETUP_CODE=… npm run test:e2e:pg
 *       the same, against an app already deployed on that database: nothing is
 *       built or started here. The setup code must be the deployment's own.
 *
 * Suites, in order — each relies on the one before:
 *   seed-pre-v1.cjs       a prototype-era database (before accounts) with records
 *   perm-test.cjs         the upgrade keeps every record; the permission matrix
 *   queue-test.cjs        the front desk's list, phone search, calling patients in
 *   workflow-test.cjs     the doctor's speed features: hand-written visits, repeat
 *                         medicines, favourites, search, step timings
 *   rx-test.cjs           prescription extras: the clinic's logo, warning signs
 *                         in the doctor's words, the medicine timing card
 *   admin-tools-test.cjs  reset-password script; restoring a pre-accounts backup
 *   tenancy-test.cjs      many clinics in one database, and Varaxis's platform
 *                         console (online only; after the others, because it
 *                         adds clinics)
 *   sync-test.cjs         a clinic computer keeping in step with its clinic
 *                         online. The Postgres run starts two more copies of
 *                         the app on SQLite, from the same build, as the
 *                         clinic computers.
 *   portal-test.cjs       sharing a signed visit with the patient, and the
 *                         patient's side of the portal
 *
 * Don't run this while `npm run dev` is running in this folder: both use .next/.
 * Works on Windows and macOS.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..", "..");
const work = path.join(appDir, ".test-data");
const port = process.env.TEST_PORT || "3100";
const onPostgresEarly = process.argv.includes("--pg");
// The Postgres run is built the way the online copy is, under /app.
const basePath = onPostgresEarly ? "/app" : "";
const deployedBase = onPostgresEarly ? (process.env.TEST_BASE_URL || "").replace(/\/$/, "") : "";
const base = deployedBase || `http://localhost:${port}${basePath}`;
const skipBuild = process.argv.includes("--no-build");
const onPostgres = process.argv.includes("--pg");
const pgPort = process.env.TEST_PG_PORT || "55432";
const realPg = onPostgres ? process.env.TEST_DATABASE_URL || "" : "";
const CLINIC_TABLES = [
  "AudioChunk", "QueueEntry", "Edit", "PortalLogin", "PortalAccount", "PortalAttempt", "PortalShare", "Consult",
  "Favourite", "Session", "AuditEvent", "Setting", "ClinicSetting", "User", "Patient", "OperatorSession", "Operator",
  "SyncDevice", "SyncTombstone",
];

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

const files = {
  db: path.join(work, "test.db"),
  preV1: path.join(work, "pre-v1.db"),
  fingerprint: path.join(work, "fingerprint.json"),
  log: path.join(work, "server.log"),
};

const env = {
  ...process.env,
  DB_PATH: files.db,
  BACKUP_DIR: path.join(work, "backups"),
  AUDIO_DIR: path.join(work, "audio"),
  TEST_BASE: base,
  NEXT_TELEMETRY_DISABLED: "1",
  // Both runs guard /setup with a code, as the online copy must.
  SETUP_CODE: process.env.TEST_SETUP_CODE || "test-setup-code",
  // The first clinic's fallback address, which no other clinic may inherit.
  CLINIC_ADDRESS: "1 Fallback Road, Testville",
  // Throwaway portal keys, so sharing with patients can be tested. Never these online.
  PORTAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  PORTAL_HMAC_KEY: Buffer.alloc(32, 9).toString("base64"),
  DATA_BACKEND: onPostgres ? "postgres" : "sqlite",
  ...(onPostgres
    ? {
        DATABASE_URL: realPg || `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres?sslmode=disable`,
        NEXT_PUBLIC_CLINIC_TIMEZONE: "Asia/Kolkata",
        NEXT_PUBLIC_CLINICOS_ONLINE: "1",
        NEXT_PUBLIC_BASE_PATH: basePath,
        // PGlite shares one real connection between all clients, and under a
        // burst of requests it can hand one client's statement another's
        // parameters ("bind message supplies 2 parameters, but prepared
        // statement requires 7"). Real Postgres never does. One connection
        // from the app avoids it; true concurrency is tested against Supabase.
        PG_POOL_MAX: realPg ? "3" : "1",
      }
    : {}),
};

const step = (title) => console.log(`\n=== ${title} ===`);

function runNode(script, args) {
  const r = spawnSync(process.execPath, [path.join(here, script), ...args], { cwd: appDir, env, stdio: "inherit" });
  return r.status ?? 1;
}

let server = null;
let pgServer = null;
const clinicComputers = [];
function stopOne(proc) {
  if (!proc || proc.exitCode !== null) return;
  if (process.platform === "win32") {
    // npm starts node as a child; /T takes the whole tree down.
    spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
}
function stopServer() {
  if (pgServer && pgServer.exitCode === null) pgServer.kill("SIGTERM");
  for (const c of clinicComputers) stopOne(c);
  stopOne(server);
}
process.on("exit", stopServer);
process.on("SIGINT", () => {
  stopServer();
  process.exit(130);
});

async function waitForServer(ms = 90_000, at = base) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${at}/login`, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

step("Checking hand-written paths carry the /app prefix");
if (spawnSync(process.execPath, [path.join(appDir, "scripts", "check-app-paths.mjs")], { stdio: "inherit" }).status !== 0) process.exit(1);

step("Seeding a prototype-era database");
if (runNode("seed-pre-v1.cjs", [files.db, files.fingerprint, files.preV1]) !== 0) process.exit(1);

async function clinicRowCount(sql) {
  let total = 0;
  for (const t of CLINIC_TABLES) {
    const [exists] = await sql`select to_regclass(${`public."${t}"`}) as r`;
    if (exists.r) total += (await sql`select count(*)::int as n from ${sql(t)}`)[0].n;
  }
  // The first clinic is made by the migrations themselves; any other is a record.
  const [tenant] = await sql`select to_regclass('public."Tenant"') as r`;
  if (tenant.r) total += (await sql`select count(*)::int as n from "Tenant" where "id" <> 'first'`)[0].n;
  return total;
}

async function withRealPg(fn) {
  const { default: postgres } = await import("postgres");
  const sql = postgres(realPg, { prepare: false, ssl: "require", max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (realPg) {
  step("Checking the real Postgres holds no clinic records");
  const rows = await withRealPg(clinicRowCount);
  if (rows > 0) {
    console.error(`It holds ${rows} clinic rows. This run only uses an empty database, and nothing was changed.`);
    process.exit(1);
  }
} else if (onPostgres) {
  step(`Starting a throwaway Postgres on port ${pgPort}`);
  pgServer = spawn(process.execPath, [path.join(here, "pg-server.mjs"), pgPort], { stdio: ["ignore", "pipe", "inherit"] });
  const ready = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 60_000);
    pgServer.stdout.on("data", (d) => {
      if (String(d).includes("ready")) {
        clearTimeout(timer);
        resolve(true);
      }
    });
    pgServer.on("exit", () => resolve(false));
  });
  if (!ready) {
    console.error("The test Postgres did not start.");
    stopServer();
    process.exit(1);
  }
  step("Copying the seed into Postgres");
  if (runNode("seed-pg.mjs", [files.db]) !== 0) {
    stopServer();
    process.exit(1);
  }
}

if (deployedBase && !realPg) {
  console.error("TEST_BASE_URL needs TEST_DATABASE_URL: the suites read the deployment's own database.");
  process.exit(1);
}

if (!skipBuild && !deployedBase) {
  step("Building");
  // Built with the test database in env: `next build` imports db.ts, which runs
  // migrations against whatever DB_PATH points at.
  const build = spawnSync("npm", ["run", "build"], { cwd: appDir, env, stdio: "inherit", shell: true });
  if (build.status !== 0) {
    stopServer();
    process.exit(1);
  }
}

async function emptyRealPg() {
  if (!realPg) return;
  step("Emptying the clinic tables the run filled");
  await withRealPg(async (sql) => {
    await sql.unsafe(`truncate ${CLINIC_TABLES.map((t) => `"${t}"`).join(", ")}`);
    await sql`delete from "Tenant" where "id" <> 'first'`;
    console.log(`Clinic rows left: ${await clinicRowCount(sql)}`);
  });
}

// Seeded only after a successful build, so a failed build leaves the real
// database exactly as empty as it was found.
if (realPg) {
  step("Copying the seed into the real Postgres");
  if (runNode("seed-pg.mjs", [files.db]) !== 0) {
    await emptyRealPg();
    process.exit(1);
  }
}

if (deployedBase) step(`Using the app already running at ${base}`);
else step(`Starting the app on ${base}`);
const out = fs.openSync(files.log, "w");
if (!deployedBase) server = spawn("npm", ["run", "start", "--", "-p", port], {
  cwd: appDir,
  env,
  shell: true,
  stdio: ["ignore", out, out],
  detached: process.platform !== "win32",
});
if (!(await waitForServer())) {
  console.error(`The app did not start. See ${files.log}`);
  stopServer();
  await emptyRealPg();
  process.exit(1);
}

// Two clinic computers for the sync suite: the same build, run on SQLite with
// their own databases. The build's /app prefix and online wording come along;
// neither matters to what the suite checks. DATA_BACKEND is read when the
// server runs, not when it is built.
const locals = [];
if (onPostgres && !deployedBase) {
  for (const [i, localPort] of [String(Number(port) + 1), String(Number(port) + 2)].entries()) {
    const dir = path.join(work, `computer${i + 1}`);
    fs.mkdirSync(dir, { recursive: true });
    const localEnv = {
      ...env,
      DATA_BACKEND: "sqlite",
      DATABASE_URL: "",
      DB_PATH: path.join(dir, "clinicos.db"),
      AUDIO_DIR: path.join(dir, "audio"),
      BACKUP_DIR: path.join(dir, "backups"),
    };
    const log = fs.openSync(path.join(dir, "server.log"), "w");
    clinicComputers.push(
      spawn("npm", ["run", "start", "--", "-p", localPort], {
        cwd: appDir,
        env: localEnv,
        shell: true,
        stdio: ["ignore", log, log],
        detached: process.platform !== "win32",
      })
    );
    locals.push({ base: `http://localhost:${localPort}${basePath}`, db: localEnv.DB_PATH, audio: localEnv.AUDIO_DIR });
  }
  for (const l of locals) {
    if (!(await waitForServer(90_000, l.base))) {
      console.error(`A clinic computer for the sync suite did not start. See ${work}`);
      stopServer();
      process.exit(1);
    }
  }
}

const suites = [
  ["perm-test.cjs", [files.db, files.fingerprint]],
  ["queue-test.cjs", [files.db]],
  ["workflow-test.cjs", [files.db]],
  ["rx-test.cjs", [files.db]],
  ["admin-tools-test.cjs", [files.db, files.preV1]],
  ["tenancy-test.cjs", [files.db]],
  ["sync-test.cjs", [files.db, JSON.stringify(locals)]],
  ["portal-test.cjs", [files.db]],
];
const failed = [];
for (const [script, args] of suites) {
  step(script);
  if (runNode(script, args) !== 0) failed.push(script);
}

stopServer();
await emptyRealPg();
console.log(
  failed.length
    ? `\nFAILED (${onPostgres ? "Postgres" : "SQLite"}): ${failed.join(", ")}`
    : `\nAll suites passed on ${onPostgres ? "Postgres" : "SQLite"}.`
);
process.exit(failed.length ? 1 : 0);
