#!/usr/bin/env node
/**
 * How ClinicOS holds up for a clinic that has been using it for years.
 *
 *   npm run bench                 5,000 patients, ~11,000 visits
 *   npm run bench -- --patients 20000 --no-build
 *
 * It builds a throwaway database in .bench/ (git-ignored, never data/), starts
 * the app against it on port 3105, signs in as a seeded doctor by writing a
 * session row, and times the screens a clinic actually opens — the median and
 * the slowest of several goes, over real HTTP, on a production build.
 *
 * It is not part of npm run test:e2e: it takes minutes and proves speed, not
 * correctness. Run it after touching a query, and before believing that
 * something is fast because it is fast with twelve patients.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(appDir, ".bench");
const dbPath = path.join(work, "clinicos.db");
const port = process.env.BENCH_PORT || "3105";
const base = `http://localhost:${port}`;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
const PATIENTS = arg("patients", 5000);
const ROUNDS = arg("rounds", 7);
const skipBuild = process.argv.includes("--no-build");

const iso = (d) => new Date(d).toISOString();
const day = (d) => iso(d).slice(0, 10);
const id = (p, n) => `${p}${String(n).padStart(7, "0")}`;

/** Rows straight into the tables the migrations made, in one transaction. */
function fill(db) {
  const now = Date.now();
  const names = ["Rina", "Asha", "Bikash", "Sunil", "Mita", "Papiya", "Tapan", "Jharna", "Amal", "Sourav", "Kajal", "Nitai"];
  const last = ["Das", "Ghosh", "Mondal", "Roy", "Sarkar", "Biswas", "Dutta", "Pal", "Sen", "Haldar"];
  const dx = ["Viral fever", "Acid peptic disease", "Upper respiratory infection", "Hypertension, on treatment", "Type 2 diabetes, on treatment", "Osteoarthritis of the knee"];

  db.exec("BEGIN");
  const patient = db.prepare(`INSERT INTO Patient (id, clinicId, name, age, sex, phone, createdAt, updatedAt) VALUES (?, 'first', ?, ?, ?, ?, ?, ?)`);
  const consult = db.prepare(
    `INSERT INTO Consult (id, clinicId, patientId, consentGiven, consentAt, consentBy, transcript, draftJson, finalJson,
                          signedAt, doctorId, followUpOn, createdAt, updatedAt)
     VALUES (?, 'first', ?, 1, ?, 'Under the clinic''s terms', ?, ?, ?, ?, 'benchdoctor', ?, ?, ?)`
  );
  const edit = db.prepare(`INSERT INTO Edit (id, clinicId, consultId, field, before, after, createdAt) VALUES (?, 'first', ?, ?, ?, ?, ?)`);
  const bill = db.prepare(
    `INSERT INTO Bill (id, clinicId, patientId, itemsJson, totalPaise, day, receiptNo, receiptPrefix, receiptSeq, paidAt, paidDay,
                       method, createdAt, updatedAt)
     VALUES (?, 'first', ?, ?, ?, ?, ?, 'BNC', ?, ?, ?, 'cash', ?, ?)`
  );
  const queue = db.prepare(
    `INSERT INTO QueueEntry (id, clinicId, patientId, day, token, status, addedAt, updatedAt) VALUES (?, 'first', ?, ?, ?, ?, ?, ?)`
  );

  let visits = 0;
  let receipts = 0;
  for (let p = 0; p < PATIENTS; p++) {
    const made = now - Math.floor(Math.random() * 900) * 86_400_000;
    const name = `${names[p % names.length]} ${last[(p * 7) % last.length]} ${p}`;
    patient.run(id("bp", p), name, 18 + (p % 70), p % 2 ? "F" : "M", `9${String(800000000 + p).slice(0, 9)}`, iso(made), iso(made));

    for (let v = 0; v < 1 + (p % 3); v++) {
      const at = made + v * 30 * 86_400_000 + 3_600_000;
      if (at > now) break;
      const note = JSON.stringify({
        chiefComplaint: "Fever, cough and body ache for three days",
        history: "No vomiting. Taking paracetamol at home.",
        examination: "Throat congested. Chest clear. Temperature 100.4F.",
        diagnosis: dx[(p + v) % dx.length],
        medications: [
          { name: "Paracetamol", dose: "650mg", frequency: "1-0-1", duration: "3 days", instructions: "After food" },
          { name: "Cetirizine", dose: "10mg", frequency: "HS", duration: "5 days", instructions: "" },
        ],
        investigations: ["CBC", "Blood sugar (fasting)"],
        advice: "Plenty of fluids. Come back if the fever does not settle.",
        followUp: "Review in a week if not better",
        returnIf: "Breathlessness, or fever above 102F",
        followUpOn: "",
      });
      const visitId = id("bc", visits++);
      consult.run(visitId, id("bp", p), iso(at), "…transcript…", note, note, iso(at + 600_000), v === 0 ? day(at + 7 * 86_400_000) : null, iso(at), iso(at + 600_000));
      for (let e = 0; e < 3; e++) {
        edit.run(id("be", visits * 3 + e), visitId, "diagnosis", "Fever", dx[(p + v + e) % dx.length], iso(at + 500_000));
      }
      if (v === 0) {
        bill.run(id("bb", receipts), id("bp", p), JSON.stringify([{ label: "Consultation", amount: 30000 }]), 30000, day(at),
          `BNC-${String(++receipts).padStart(4, "0")}`, receipts, iso(at), day(at), iso(at), iso(at));
      }
    }
    // A few hundred on today's list, as a busy morning would be.
    if (p < 300) {
      const t = now - p * 60_000;
      queue.run(id("bq", p), id("bp", p), day(now), p + 1, p % 4 === 0 ? "waiting" : "done", iso(t), iso(t));
    }
  }
  db.exec("COMMIT");
  return { visits, receipts };
}

// ------------------------------------------------------------------ run
async function waitFor(url, ms = 120_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function time(path, cookie, rounds) {
  const took = [];
  let status = 0;
  let bytes = 0;
  for (let i = 0; i < rounds; i++) {
    const t = Date.now();
    const res = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
    const body = await res.arrayBuffer();
    took.push(Date.now() - t);
    status = res.status;
    bytes = body.byteLength;
  }
  took.sort((a, b) => a - b);
  return { path, status, kb: Math.round(bytes / 1024), median: took[Math.floor(took.length / 2)], slowest: took.at(-1) };
}

const env = {
  ...process.env,
  DB_PATH: dbPath,
  AUDIO_DIR: path.join(work, "audio"),
  BACKUP_DIR: path.join(work, "backups"),
  DATA_BACKEND: "sqlite",
  SETUP_CODE: "bench",
  NEXT_TELEMETRY_DISABLED: "1",
};

console.log(`Building a clinic of ${PATIENTS.toLocaleString("en-IN")} patients in .bench/`);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

// The build imports db.ts and so creates and migrates the database; with
// --no-build, starting the app does the same on its first request.
if (!skipBuild) {
  const build = spawnSync("npm", ["run", "build"], { cwd: appDir, env, stdio: "inherit", shell: true });
  if (build.status !== 0) process.exit(1);
}

const server = spawn("npm", ["run", "start", "--", "-p", port], {
  cwd: appDir,
  env,
  shell: true,
  stdio: ["ignore", "ignore", "inherit"],
  detached: process.platform !== "win32",
});
const stop = () => {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* gone */
    }
  }
};
process.on("exit", stop);
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

if (!(await waitFor(`${base}/login`))) {
  console.error("The app did not start.");
  stop();
  process.exit(1);
}

// The schema now exists (the app migrated it). Fill it, then make an account
// and a session so the pages can be opened.
const db = new Database(dbPath);
const filled = fill(db);
const userId = "benchdoctor";
db.prepare(
  `INSERT INTO User (id, clinicId, name, username, role, isAdmin, passwordHash, active, mustChangePassword, createdAt, updatedAt)
   VALUES (?, 'first', 'Dr Bench', 'bench', 'doctor', 1, 'scrypt$x', 1, 0, ?, ?)
   ON CONFLICT (id) DO NOTHING`
).run(userId, iso(Date.now()), iso(Date.now()));
const token = crypto.randomBytes(32).toString("base64url");
db.prepare(`INSERT INTO Session (tokenHash, userId, createdAt, expiresAt, lastSeenAt) VALUES (?, ?, ?, ?, ?)`).run(
  crypto.createHash("sha256").update(token).digest("hex"),
  userId,
  iso(Date.now()),
  iso(Date.now() + 12 * 3600 * 1000),
  iso(Date.now())
);
db.prepare(`INSERT INTO ClinicSetting (clinicId, key, value, updatedAt) VALUES ('first', 'clinic_fee', '30000', ?)
            ON CONFLICT (clinicId, key) DO UPDATE SET value = excluded.value`).run(iso(Date.now()));
db.close();
console.log(`Seeded ${PATIENTS.toLocaleString("en-IN")} patients, ${filled.visits.toLocaleString("en-IN")} visits, ${filled.receipts.toLocaleString("en-IN")} receipts.`);

const cookie = `clinicos_session=${token}`;
const screens = [
  "/",
  "/patients",
  "/patients?q=Das",
  "/patients?q=98000",
  `/patients/${id("bp", 12)}`,
  `/consult/${id("bc", 12)}`,
  "/bills",
  "/followups",
  "/admin",
  "/api/queue",
  "/api/followups",
  "/api/bills",
];

console.log(`\nMedian of ${ROUNDS} goes, on a production build, over HTTP:\n`);
console.log("screen                                 status    KB   median   slowest");
for (const s of screens) {
  const r = await time(s, cookie, ROUNDS);
  console.log(
    `${r.path.padEnd(38)} ${String(r.status).padStart(4)} ${String(r.kb).padStart(6)} ${String(r.median + " ms").padStart(8)} ${String(r.slowest + " ms").padStart(9)}`
  );
}
// The export is the one page that must read everything the clinic has.
const exported = await time("/api/backup/export", cookie, 1);
console.log(`${exported.path.padEnd(38)} ${String(exported.status).padStart(4)} ${String(exported.kb).padStart(6)} ${String(exported.median + " ms").padStart(8)}`);

stop();
console.log("\n.bench/ is throwaway: delete it whenever.");
