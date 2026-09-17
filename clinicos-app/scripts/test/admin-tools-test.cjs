// The tools for bad days: the reset-password script a locked-out owner runs at
// the laptop, and restoring a backup made before accounts existed. Run last by
// run.mjs — it resets the owner's password and replaces the database.
//
// Online (Postgres) there is no database file to restore, so that run checks
// the restore is refused and leaves everything as it was.
//   node scripts/test/admin-tools-test.cjs <test.db> <pre-v1-backup.db>
const { peek, ONLINE } = require("./peek.cjs");
const { execFileSync } = require("child_process");
const fs = require("fs");

const BASE = process.env.TEST_BASE || "http://localhost:3000";
const [dbPath, preV1Path] = process.argv.slice(2);
const results = [];
const check = (name, ok, info = "") => results.push({ ok: !!ok, name, info: String(info) });

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.cookie = `clinicos_session=${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  const token2 = (res.headers.getSetCookie?.() || [])
    .map((c) => c.match(/^clinicos_session=([^;]*)/))
    .filter((m) => m && m[1])
    .map((m) => m[1])
    .at(-1);
  return { status: res.status, json, token: token2 || null };
}

const resetScript = (username) => {
  try {
    return execFileSync(process.execPath, ["scripts/reset-password.mjs", username], {
      env: { ...process.env, DB_PATH: dbPath },
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (e) {
    return String(e.stdout || "") + String(e.stderr || "");
  }
};

function report() {
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  [${x.info}]`}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

(async () => {
  // ---------------------------------------------------- reset-password script
  const out = resetScript("owner");
  const temp = out.match(/Temporary password for .*?:\s+([a-z0-9]{10})/)?.[1];
  check("Script prints a temporary password", !!temp, out.trim().split("\n")[0]);

  let r = await call("POST", "/api/auth/login", { body: { username: "owner", password: "owner-pass-1" } });
  check("Script invalidates the old password", r.status === 401, r.status);
  r = await call("POST", "/api/auth/login", { body: { username: "owner", password: temp } });
  check("Script's temporary password signs in and forces a change", r.status === 200 && r.json?.redirect === "/account/password", JSON.stringify(r.json));
  const change = await call("POST", "/api/auth/password", { token: r.token, body: { current: temp, next: "owner-pass-2" } });
  check("Owner sets a new password", change.status === 200, change.status);
  {
    const db = peek(dbPath);
    const n = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "AuditEvent" WHERE action = 'user_password_reset' AND "userName" = 'reset-password script'`)).n;
    check("Script's reset is in the activity log", n === 1, n);
    await db.close();
  }

  const wrongName = resetScript("no-such-person");
  check("Script names the real accounts when the username is wrong", /No account called "no-such-person"/.test(wrongName) && /owner/.test(wrongName), wrongName.trim());

  // ---------------------------------------------------- restore a pre-v1 backup
  r = await call("POST", "/api/auth/login", { body: { username: "owner", password: "owner-pass-2" } });
  const owner = r.token;
  check("Owner signs in with the new password", r.status === 200 && owner, r.status);

  const bytes = fs.readFileSync(preV1Path);
  const refuse = new FormData();
  refuse.append("backup", new Blob([bytes]), "pre-v1.db");
  refuse.append("confirm", "restore please");
  r = await call("POST", "/api/backup/restore", { token: owner, form: refuse });
  check("Restore refuses without typing RESTORE", r.status === 400, r.status);

  const form = new FormData();
  form.append("backup", new Blob([bytes]), "pre-v1.db");
  form.append("confirm", "RESTORE");
  r = await call("POST", "/api/backup/restore", { token: owner, form });

  if (ONLINE) {
    check("Online: restoring a backup file is refused, with the reason", r.status === 400 && /clinic computer/.test(r.json?.error || ""), JSON.stringify(r.json));
    const db = peek(dbPath);
    const users = (await db.all(`SELECT username FROM "User"`)).map((u) => u.username);
    check("Online: the refused restore changed no accounts", users.includes("owner") && users.includes("desk"), users.join(","));
    await db.close();
    r = await call("GET", "/api/patients", { token: owner });
    check("Online: the owner stays signed in", r.status === 200, r.status);
    r = await call("GET", "/api/backup/download", { token: owner });
    check("Online: downloading a backup file is refused, not a crash", r.status >= 400 && r.status < 500, r.status);
    r = await call("GET", "/api/backup/export", { token: owner });
    check("Online: Export everything still works", r.status === 200 && r.json?.format === "clinicos-full-export", r.status);
    const setup = await fetch(BASE + "/setup", { redirect: "manual" });
    check("/setup stays closed", setup.status >= 300 && setup.status < 400, setup.status);
    report();
    return;
  }

  check("Restore of a pre-accounts backup succeeds", r.status === 200 && r.json?.ok, JSON.stringify(r.json));

  {
    const db = peek(dbPath);
    const users = (await db.all(`SELECT username FROM "User"`)).map((u) => u.username);
    check("Only the person restoring is kept, so setup is not left open", users.length === 1 && users[0] === "owner", users.join(","));
    const restoreLogged = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "AuditEvent" WHERE action = 'backup_restore'`)).n;
    check("The restore is recorded in the restored log", restoreLogged === 1, restoreLogged);
    await db.close();
  }

  r = await call("GET", "/api/patients", { token: owner });
  check("Old session ends with the restore", r.status === 401, r.status);
  r = await call("POST", "/api/auth/login", { body: { username: "owner", password: "owner-pass-2" } });
  check("The person restoring signs straight back in", r.status === 200, r.status);
  const setup = await fetch(BASE + "/setup", { redirect: "manual" });
  check("/setup stays closed after the restore", setup.status >= 300 && setup.status < 400, setup.status);

  report();
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
