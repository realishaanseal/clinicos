#!/usr/bin/env node
/**
 * Run the app for clicking around, against a throwaway database.
 *
 *   npm run dev:sandbox            http://localhost:3002
 *
 * `npm run dev` reads .env, whose DB_PATH is data/ — the clinic's real records.
 * Test accounts made there become the clinic's accounts (CLAUDE.md, gotchas).
 * This starts the same dev server with every path pointed at .sandbox/, which
 * is git-ignored and safe to delete. Setup asks for the code "sandbox".
 *
 * It shares .next/ with `npm run dev` and `npm run test:e2e`: run one at a time.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const box = path.join(appDir, ".sandbox");
const port = process.env.PORT || "3002";

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

console.log(`Sandbox database: ${env.DB_PATH}`);
const child = spawn("npx", ["next", "dev", "-p", port], { cwd: appDir, env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
