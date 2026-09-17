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
 * Suites, in order — each relies on the one before:
 *   seed-pre-v1.cjs       a prototype-era database (before accounts) with records
 *   perm-test.cjs         the upgrade keeps every record; the permission matrix
 *   queue-test.cjs        the front desk's list, phone search, calling patients in
 *   admin-tools-test.cjs  reset-password script; restoring a pre-accounts backup
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
const base = `http://localhost:${port}`;
const skipBuild = process.argv.includes("--no-build");
const onPostgres = process.argv.includes("--pg");
const pgPort = process.env.TEST_PG_PORT || "55432";

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
  SETUP_CODE: "test-setup-code",
  DATA_BACKEND: onPostgres ? "postgres" : "sqlite",
  ...(onPostgres
    ? {
        DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres?sslmode=disable`,
        NEXT_PUBLIC_CLINIC_TIMEZONE: "Asia/Kolkata",
        NEXT_PUBLIC_CLINICOS_ONLINE: "1",
        // PGlite shares one real connection between all clients, and under a
        // burst of requests it can hand one client's statement another's
        // parameters ("bind message supplies 2 parameters, but prepared
        // statement requires 7"). Real Postgres never does. One connection
        // from the app avoids it; true concurrency is tested against Supabase.
        PG_POOL_MAX: "1",
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
function stopServer() {
  if (pgServer && pgServer.exitCode === null) pgServer.kill("SIGTERM");
  if (!server || server.exitCode !== null) return;
  if (process.platform === "win32") {
    // npm starts node as a child; /T takes the whole tree down.
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
}
process.on("exit", stopServer);
process.on("SIGINT", () => {
  stopServer();
  process.exit(130);
});

async function waitForServer(ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${base}/login`, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

step("Seeding a prototype-era database");
if (runNode("seed-pre-v1.cjs", [files.db, files.fingerprint, files.preV1]) !== 0) process.exit(1);

if (onPostgres) {
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

if (!skipBuild) {
  step("Building");
  // Built with the test database in env: `next build` imports db.ts, which runs
  // migrations against whatever DB_PATH points at.
  const build = spawnSync("npm", ["run", "build"], { cwd: appDir, env, stdio: "inherit", shell: true });
  if (build.status !== 0) {
    stopServer();
    process.exit(1);
  }
}

step(`Starting the app on ${base}`);
const out = fs.openSync(files.log, "w");
server = spawn("npm", ["run", "start", "--", "-p", port], {
  cwd: appDir,
  env,
  shell: true,
  stdio: ["ignore", out, out],
  detached: process.platform !== "win32",
});
if (!(await waitForServer())) {
  console.error(`The app did not start. See ${files.log}`);
  stopServer();
  process.exit(1);
}

const suites = [
  ["perm-test.cjs", [files.db, files.fingerprint]],
  ["queue-test.cjs", [files.db]],
  ["admin-tools-test.cjs", [files.db, files.preV1]],
];
const failed = [];
for (const [script, args] of suites) {
  step(script);
  if (runNode(script, args) !== 0) failed.push(script);
}

stopServer();
console.log(
  failed.length
    ? `\nFAILED (${onPostgres ? "Postgres" : "SQLite"}): ${failed.join(", ")}`
    : `\nAll suites passed on ${onPostgres ? "Postgres" : "SQLite"}.`
);
process.exit(failed.length ? 1 : 0);
