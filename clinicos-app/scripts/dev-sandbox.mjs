#!/usr/bin/env node
/**
 * Run the app for clicking around, against a throwaway database.
 *
 *   npm run dev:sandbox            http://localhost:3002         (a clinic computer: SQLite)
 *   npm run dev:sandbox:pg         http://localhost:3002/app     (the online service: Postgres,
 *                                                                 many clinics, the platform console)
 *
 * `npm run dev` reads .env, whose DB_PATH is data/ — the clinic's real records.
 * Test accounts made there become the clinic's accounts (CLAUDE.md, gotchas).
 * This starts the same dev server with every path pointed at .sandbox/, which
 * is git-ignored and safe to delete. Setup asks for the code "sandbox".
 *
 * The Postgres sandbox runs PGlite (nothing to install) with its data in
 * .sandbox/pg, and makes an operator account "sandbox" on its first run,
 * printing the temporary password for the console at /app/platform/login.
 *
 * It shares .next/ with `npm run dev` and `npm run test:e2e`: run one at a time.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const box = path.join(appDir, ".sandbox");
const port = process.env.PORT || "3002";
const onPg = process.argv.includes("--pg");
const pgPort = process.env.SANDBOX_PG_PORT || "55433";

// Next.js never overrides a variable that is already set, so these win over .env.
const env = {
  ...process.env,
  DB_PATH: path.join(box, "clinicos.db"),
  AUDIO_DIR: path.join(box, "audio"),
  BACKUP_DIR: path.join(box, "backups"),
  DATA_BACKEND: "sqlite",
  SETUP_CODE: process.env.SETUP_CODE || "sandbox",
  NEXT_TELEMETRY_DISABLED: "1",
};

let pg = null;
if (onPg) {
  const dataDir = path.join(box, "pg");
  const firstRun = !fs.existsSync(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  pg = spawn(process.execPath, [path.join(appDir, "scripts", "test", "pg-server.mjs"), pgPort, dataDir], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve, reject) => {
    pg.stdout.on("data", (d) => String(d).includes("ready") && resolve());
    pg.on("exit", () => reject(new Error("The sandbox Postgres did not start.")));
  });
  Object.assign(env, {
    DATA_BACKEND: "postgres",
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres?sslmode=disable`,
    PG_POOL_MAX: "1",
    NEXT_PUBLIC_BASE_PATH: "/app",
    NEXT_PUBLIC_CLINIC_TIMEZONE: "Asia/Kolkata",
    NEXT_PUBLIC_CLINICOS_ONLINE: "1",
  });
  if (spawnSync(process.execPath, [path.join(appDir, "scripts", "migrate-pg.mjs")], { env, stdio: "inherit" }).status !== 0) {
    pg.kill();
    process.exit(1);
  }
  if (firstRun) {
    spawnSync(process.execPath, [path.join(appDir, "scripts", "operator.mjs"), "add", "sandbox", "Sandbox Operator"], { env, stdio: "inherit" });
  }
  console.log(`Sandbox Postgres: ${dataDir}\nPlatform console: http://localhost:${port}/app/platform/login`);
} else {
  console.log(`Sandbox database: ${env.DB_PATH}`);
}

const child = spawn("npx", ["next", "dev", "-p", port], { cwd: appDir, env, stdio: "inherit", shell: true });
const stop = () => pg?.kill();
child.on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});
