// Permission matrix and upgrade safety, over real HTTP. Run by run.mjs:
//   node scripts/test/perm-test.cjs <test.db> <fingerprint.json>
// Expects a freshly seeded database with no accounts yet, and the app running
// at TEST_BASE against it.
const { peek, ONLINE } = require("./peek.cjs");
const fs = require("fs");

const BASE = process.env.TEST_BASE || "http://localhost:3000";
const [dbPath, fingerprintPath] = process.argv.slice(2);
const results = [];
const check = (name, ok, info = "") => results.push({ ok: !!ok, name, info: String(info) });

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.cookie = `clinicos_session=${token}`;
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  const cookies = (res.headers.getSetCookie?.() || [])
    .map((c) => c.match(/^clinicos_session=([^;]*)/))
    .filter(Boolean)
    .map((m) => m[1])
    .filter((v) => v);
  return { status: res.status, json, text, location: res.headers.get("location"), token: cookies.at(-1) || null };
}

const goesTo = (r, target) =>
  (r.status >= 300 && r.status < 400 && r.location && new URL(r.location, BASE).pathname === target) ||
  r.text.includes(`NEXT_REDIRECT;replace;${target};`) ||
  r.text.includes(`NEXT_REDIRECT;push;${target};`);

const fingerprintOf = async (db) => ({
  patients: await db.all(`SELECT id, name, age, sex, phone, "guardianName", "createdAt" FROM "Patient" WHERE id LIKE 'seed%' ORDER BY id`),
  consults: await db.all(
    `SELECT id, "patientId", "consentGiven", "consentAt", "consentBy", transcript, "draftJson", "finalJson",
            "signedAt", "audioDeletedAt", "createdAt"
     FROM "Consult" WHERE id LIKE 'seed%' ORDER BY id`
  ),
  edits: await db.all(`SELECT id, "consultId", field, before, after, "createdAt" FROM "Edit" WHERE id LIKE 'seed%' ORDER BY id`),
});

const idOf = async (username) => {
  const db = peek(dbPath);
  const id = (await db.get(`SELECT id FROM "User" WHERE username = ?`, username))?.id;
  await db.close();
  return id;
};

(async () => {
  // ------------------------------------------------ 0. the upgrade kept everything
  await call("GET", "/login"); // make sure the server has opened (and migrated) the database
  const fp = JSON.parse(fs.readFileSync(fingerprintPath, "utf8"));
  {
    const db = peek(dbPath);
    const now = await fingerprintOf(db);
    check("Upgrade: patients unchanged", JSON.stringify(now.patients) === JSON.stringify(fp.patients));
    check("Upgrade: consultations unchanged", JSON.stringify(now.consults) === JSON.stringify(fp.consults));
    check("Upgrade: edits unchanged", JSON.stringify(now.edits) === JSON.stringify(fp.edits));
    const tables = await db.tables();
    check("Upgrade: account and queue tables added", ["User", "Session", "AuditEvent", "Setting", "QueueEntry"].every((t) => tables.includes(t)), tables.join(","));
    await db.close();
  }

  // ------------------------------------------------ 1. before anyone exists
  let r = await call("GET", "/login");
  check("No accounts: /login → /setup", goesTo(r, "/setup"), `${r.status} ${r.location}`);
  r = await call("GET", "/");
  check("No session: / → /login", goesTo(r, "/login"), `${r.status} ${r.location}`);

  const everyApi = [
    ["GET", "/api/patients"], ["POST", "/api/patients"], ["POST", "/api/consults"],
    ["POST", "/api/consults/seedconsult2/consent"], ["POST", "/api/consults/seedconsult2/audio"],
    ["POST", "/api/consults/seedconsult2/audio/chunk"], ["POST", "/api/consults/seedconsult2/audio/finalize"],
    ["PATCH", "/api/consults/seedconsult2/draft"], ["POST", "/api/consults/seedconsult2/draft"],
    ["POST", "/api/consults/seedconsult2/note"], ["POST", "/api/consults/seedconsult2/transcribe"],
    ["POST", "/api/consults/seedconsult2/sign"], ["DELETE", "/api/patients/seedpatient1"],
    ["GET", "/api/patients/seedpatient1/export"], ["POST", "/api/backup/create"], ["GET", "/api/backup/download"],
    ["GET", "/api/backup/export"], ["POST", "/api/backup/restore"], ["POST", "/api/admin/settings"],
    ["POST", "/api/admin/users"], ["PATCH", "/api/admin/users/x"], ["POST", "/api/admin/users/x/reset"],
    ["POST", "/api/auth/password"], ["GET", "/api/queue"], ["POST", "/api/queue"],
    ["POST", "/api/queue/x/start"], ["POST", "/api/queue/x/left"],
  ];
  const not401 = [];
  for (const [m, p] of everyApi) {
    const x = await call(m, p, { body: m === "GET" ? undefined : {} });
    if (x.status !== 401) not401.push(`${m} ${p}=${x.status}`);
  }
  check(`No session: all ${everyApi.length} API routes → 401`, not401.length === 0, not401.join("; "));

  // A cookie that passes the middleware's presence check but is not a session.
  const forgedNot401 = [];
  for (const [m, p] of everyApi) {
    const x = await call(m, p, { token: "forged-token-value", body: m === "GET" ? undefined : {} });
    if (x.status !== 401) forgedNot401.push(`${m} ${p}=${x.status}`);
  }
  check(`Forged cookie: all ${everyApi.length} API routes → 401 (checked in the handler)`, forgedNot401.length === 0, forgedNot401.join("; "));

  // ------------------------------------------------ 2. setup
  const setupCode = process.env.SETUP_CODE;
  if (setupCode) {
    r = await call("POST", "/api/setup", {
      body: { clinicName: "X", name: "Stranger", username: "stranger", password: "stranger-pass", isDoctor: true },
    });
    check("Setup refuses without the setup code", r.status === 403 && !r.token, r.status);
    r = await call("POST", "/api/setup", {
      body: { setupCode: "not-the-code", clinicName: "X", name: "Stranger", username: "stranger", password: "stranger-pass", isDoctor: true },
    });
    check("Setup refuses a wrong setup code", r.status === 403 && !r.token, r.status);
  }
  r = await call("POST", "/api/setup", {
    body: { setupCode, clinicName: "Test Clinic", name: "Dr Owner", username: "owner", password: "owner-pass-1", isDoctor: true, qualification: "MBBS", regNo: "WB-1" },
  });
  const owner = r.token;
  check("Setup creates the owner and signs them in", r.status === 200 && owner, r.status);
  r = await call("POST", "/api/setup", { body: { setupCode, clinicName: "X", name: "Intruder", username: "intruder", password: "intruder-pass", isDoctor: true } });
  check("Setup refuses a second owner", r.status === 409, r.status);
  r = await call("GET", "/setup");
  check("/setup → /login once set up", goesTo(r, "/login"), `${r.status} ${r.location}`);

  // ------------------------------------------------ 3. owner adds people
  const add = (body) => call("POST", "/api/admin/users", { token: owner, body });
  const deskAdd = await add({ name: "Front Desk", username: "desk", role: "staff", isAdmin: true });
  const mgrAdd = await add({ name: "Manager", username: "manager", role: "admin" });
  const docAdd = await add({ name: "Dr Second", username: "doc2", role: "doctor", isAdmin: false, qualification: "MD", regNo: "WB-2" });
  check("Owner adds staff, admin and doctor", [deskAdd, mgrAdd, docAdd].every((x) => x.status === 200 && x.json?.tempPassword), [deskAdd, mgrAdd, docAdd].map((x) => x.status).join(","));
  r = await add({ name: "Dup", username: "DESK", role: "staff" });
  check("Duplicate username refused, ignoring case", r.status === 409, r.status);
  r = await add({ name: "Bad", username: "a b", role: "staff" });
  check("Invalid username refused", r.status === 400, r.status);

  // ------------------------------------------------ 4. temporary passwords
  const firstSignIn = async (username, temp, newPassword) => {
    const login = await call("POST", "/api/auth/login", { body: { username, password: temp } });
    const blocked = await call("GET", "/api/patients", { token: login.token });
    const page = await call("GET", "/admin", { token: login.token });
    const change = await call("POST", "/api/auth/password", { token: login.token, body: { current: temp, next: newPassword } });
    return { login, blocked, page, change, token: login.token };
  };
  const desk = await firstSignIn("desk", deskAdd.json.tempPassword, "desk-pass-123");
  check("Temp password: sign-in lands on the password page", desk.login.status === 200 && desk.login.json?.redirect === "/account/password", JSON.stringify(desk.login.json));
  check("Temp password: API blocked until changed", desk.blocked.status === 403, desk.blocked.status);
  check("Temp password: pages redirect to the password page", goesTo(desk.page, "/account/password"), `${desk.page.status} ${desk.page.location}`);
  check("Temp password: change accepted", desk.change.status === 200, JSON.stringify(desk.change.json));
  const mgr = await firstSignIn("manager", mgrAdd.json.tempPassword, "manager-pass-123");
  const doc2 = await firstSignIn("doc2", docAdd.json.tempPassword, "doc2-pass-123");
  check("Temp password: admin and doctor changed theirs", mgr.change.status === 200 && doc2.change.status === 200, `${mgr.change.status},${doc2.change.status}`);

  {
    const db = peek(dbPath);
    const deskRow = await db.get(`SELECT "isAdmin" FROM "User" WHERE username = 'desk'`);
    check("Staff can never be an admin, even if asked", deskRow?.isAdmin === 0, JSON.stringify(deskRow));
    const hashes = (await db.all(`SELECT "passwordHash" FROM "User"`)).map((u) => u.passwordHash);
    check("Passwords stored only as scrypt hashes", hashes.every((h) => h.startsWith("scrypt$") && !h.includes("pass-123")));
    await db.close();
  }

  // ------------------------------------------------ 5. permission matrix
  const expectStatus = async (who, token, m, p, want, body) => {
    const x = await call(m, p, { token, body: body ?? (m === "GET" ? undefined : {}) });
    check(`${who}: ${m} ${p} → ${want}`, x.status === want, `${x.status} ${x.json?.error ?? ""}`);
    return x;
  };
  const expectPage = async (who, token, p, target) => {
    const x = await call("GET", p, { token });
    if (target === 200) check(`${who}: page ${p} opens`, x.status === 200, `${x.status} ${x.location ?? ""}`);
    else check(`${who}: page ${p} → ${target}`, goesTo(x, target), `${x.status} ${x.location ?? ""}`);
    return x;
  };

  // doctor (not admin)
  const consultA = await expectStatus("Doctor", doc2.token, "POST", "/api/consults", 200, { patientId: "seedpatient2" });
  const consultAId = consultA.json?.consult?.id;
  await expectStatus("Doctor", doc2.token, "GET", "/api/patients", 200);
  await expectStatus("Doctor", doc2.token, "PATCH", "/api/consults/seedconsult2/draft", 200, { transcript: "edited transcript" });
  const gate = await expectStatus("Doctor", doc2.token, "POST", "/api/consults/seedconsult3/audio/chunk?first=1", 403);
  check("Consent gate still speaks about consent, not permissions", /consent/i.test(gate.json?.error ?? ""), gate.json?.error);
  await expectStatus("Doctor", doc2.token, "GET", "/api/backup/export", 403);
  await expectStatus("Doctor", doc2.token, "POST", "/api/admin/users", 403, { name: "X", username: "xxx", role: "staff" });
  await expectStatus("Doctor", doc2.token, "GET", "/api/patients/seedpatient1/export", 403);
  await expectPage("Doctor", doc2.token, "/", 200);
  await expectPage("Doctor", doc2.token, "/consult/seedconsult1", 200);
  await expectPage("Doctor", doc2.token, "/admin", "/");

  // front desk
  await expectStatus("Staff", desk.token, "GET", "/api/patients", 200);
  const walkIn = await expectStatus("Staff", desk.token, "POST", "/api/patients", 200, { name: "Walk In Patient", age: "30" });
  check("Staff registering a patient does not open a consultation", walkIn.json?.consultId === null, JSON.stringify(walkIn.json));
  await expectStatus("Staff", desk.token, "POST", `/api/consults/${consultAId}/consent`, 200);
  await expectStatus("Staff", desk.token, "POST", "/api/consults", 403, { patientId: "seedpatient2" });
  await expectStatus("Staff", desk.token, "PATCH", "/api/consults/seedconsult2/draft", 403, { transcript: "x" });
  await expectStatus("Staff", desk.token, "POST", "/api/consults/seedconsult2/note", 403);
  await expectStatus("Staff", desk.token, "POST", "/api/consults/seedconsult2/transcribe", 403);
  await expectStatus("Staff", desk.token, "POST", "/api/consults/seedconsult2/sign", 403, { note: {} });
  await expectStatus("Staff", desk.token, "POST", `/api/consults/${consultAId}/audio/chunk`, 403);
  await expectStatus("Staff", desk.token, "GET", "/api/patients/seedpatient1/export", 403);
  await expectStatus("Staff", desk.token, "GET", "/api/backup/export", 403);
  await expectStatus("Staff", desk.token, "POST", "/api/admin/users", 403, { name: "X", username: "xxx", role: "staff" });
  await expectStatus("Staff", desk.token, "POST", "/api/admin/settings", 403, { name: "Hijack" });
  await expectPage("Staff", desk.token, "/patients", 200);
  const deskHome = await expectPage("Staff", desk.token, "/", 200);
  check("Staff Today shows no diagnoses", !deskHome.text.includes("Viral fever") && !deskHome.text.includes("Gastritis"));
  await expectPage("Staff", desk.token, "/consult/seedconsult1", "/");
  await expectPage("Staff", desk.token, "/patients/seedpatient1", "/");
  await expectPage("Staff", desk.token, "/admin", "/");
  const deskList = await call("GET", "/patients", { token: desk.token });
  check("Staff patient list has no links into clinical records", !deskList.text.includes('href="/patients/seedpatient1"'));

  {
    const db = peek(dbPath);
    const consentBy = (await db.get(`SELECT "consentBy" FROM "Consult" WHERE id = ?`, consultAId))?.consentBy;
    check("Consent records who actually took it", consentBy === "Front Desk (Front desk)", consentBy);
    await db.close();
  }

  // non-clinical admin
  await expectStatus("Admin", mgr.token, "GET", "/api/patients", 403);
  await expectStatus("Admin", mgr.token, "POST", `/api/consults/${consultAId}/consent`, 403);
  await expectStatus("Admin", mgr.token, "PATCH", "/api/consults/seedconsult2/draft", 403, { transcript: "x" });
  await expectStatus("Admin", mgr.token, "POST", "/api/consults/seedconsult2/sign", 403, { note: {} });
  await expectStatus("Admin", mgr.token, "POST", "/api/consults/seedconsult2/note", 403);
  await expectStatus("Admin", mgr.token, "GET", "/api/backup/export", 200);
  await expectStatus("Admin", mgr.token, "GET", "/api/patients/seedpatient1/export", 200);
  await expectStatus("Admin", mgr.token, "POST", "/api/admin/settings", 200, { name: "Test Clinic Renamed", address: "1 Test Road", phone: "0000" });
  await expectPage("Admin", mgr.token, "/admin", 200);
  await expectPage("Admin", mgr.token, "/admin/users", 200);
  await expectPage("Admin", mgr.token, "/admin/audit", 200);
  await expectPage("Admin", mgr.token, "/", "/admin");
  await expectPage("Admin", mgr.token, "/patients", "/admin");
  await expectPage("Admin", mgr.token, "/consult/seedconsult1", "/admin");
  await expectPage("Admin", mgr.token, "/settings", "/admin");

  // owner: doctor + admin
  await expectPage("Owner", owner, "/", 200);
  await expectPage("Owner", owner, "/admin", 200);
  await expectStatus("Owner", owner, "GET", "/api/backup/export", 200);

  // ------------------------------------------------ 6. signing
  const draft = JSON.parse(fp.consults.find((c) => c.id === "seedconsult2").draftJson);
  const signed = await expectStatus("Doctor", doc2.token, "POST", "/api/consults/seedconsult2/sign", 200, {
    note: { ...draft, diagnosis: "Gastritis, likely NSAID related" },
  });
  check("Signing logs the correction", signed.json?.editCount === 1, JSON.stringify(signed.json));
  {
    const db = peek(dbPath);
    const c = await db.get(`SELECT "doctorId", "draftJson" FROM "Consult" WHERE id = 'seedconsult2'`);
    const doc2Id = (await db.get(`SELECT id FROM "User" WHERE username = 'doc2'`)).id;
    check("Signed note records the signing doctor", c.doctorId === doc2Id, c.doctorId);
    check("draftJson is untouched by signing", c.draftJson === fp.consults.find((x) => x.id === "seedconsult2").draftJson);
    const audit = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "AuditEvent" WHERE action = 'consult_sign' AND "targetId" = 'seedconsult2' AND "userId" = ?`, doc2Id)).n;
    check("Signature is in the activity log", audit === 1, audit);
    await db.close();
  }
  const rx = await call("GET", "/consult/seedconsult2", { token: owner });
  check("Prescription prints the signing doctor, not the viewer", rx.text.includes("Dr Second") && rx.text.includes("WB-2"), rx.status);
  check("Prescription prints the clinic details set in admin", rx.text.includes("Test Clinic Renamed") && rx.text.includes("1 Test Road"));
  const oldRx = await call("GET", "/consult/seedconsult1", { token: owner });
  check("Pre-v1 signed note still renders", oldRx.status === 200 && oldRx.text.includes("Viral fever, resolving"), oldRx.status);

  // ------------------------------------------------ 7. account safety
  const ownerId = await idOf("owner");
  const deskId = await idOf("desk");
  const doc2Id = await idOf("doc2");

  await expectStatus("Owner", owner, "PATCH", `/api/admin/users/${ownerId}`, 400, { active: false });
  await expectStatus("Owner", owner, "PATCH", `/api/admin/users/${ownerId}`, 400, { isAdmin: false });
  await expectStatus("Owner", owner, "POST", `/api/admin/users/${ownerId}/reset`, 400);

  await expectStatus("Owner", owner, "PATCH", `/api/admin/users/${deskId}`, 200, { active: false });
  r = await call("GET", "/api/patients", { token: desk.token });
  check("Deactivated account's open session stops working", r.status === 401, r.status);
  r = await call("POST", "/api/auth/login", { body: { username: "desk", password: "desk-pass-123" } });
  check("Deactivated account cannot sign in", r.status === 401, r.status);
  await expectStatus("Owner", owner, "PATCH", `/api/admin/users/${deskId}`, 200, { active: true });
  r = await call("POST", "/api/auth/login", { body: { username: "desk", password: "desk-pass-123" } });
  check("Reactivated account signs in with their own password", r.status === 200, r.status);

  const reset = await expectStatus("Owner", owner, "POST", `/api/admin/users/${doc2Id}/reset`, 200);
  r = await call("GET", "/api/patients", { token: doc2.token });
  check("Password reset ends the person's sessions", r.status === 401, r.status);
  r = await call("POST", "/api/auth/login", { body: { username: "doc2", password: "doc2-pass-123" } });
  check("Old password stops working after reset", r.status === 401, r.status);
  r = await call("POST", "/api/auth/login", { body: { username: "doc2", password: reset.json?.tempPassword } });
  check("Temporary password from reset works and forces a change", r.status === 200 && r.json?.redirect === "/account/password", JSON.stringify(r.json));

  const unknown = await call("POST", "/api/auth/login", { body: { username: "nobody-here", password: "whatever-123" } });
  const wrong = await call("POST", "/api/auth/login", { body: { username: "owner", password: "wrong-password" } });
  check("Unknown user and wrong password get the same answer", unknown.status === 401 && wrong.status === 401 && unknown.json?.error === wrong.json?.error, `${unknown.json?.error} | ${wrong.json?.error}`);

  let lastStatus = 0;
  for (let i = 0; i < 11; i++) {
    lastStatus = (await call("POST", "/api/auth/login", { body: { username: "ghost-user", password: `guess-${i}` } })).status;
  }
  check("Eleventh wrong attempt in a row is refused (429)", lastStatus === 429, lastStatus);

  r = await call("POST", "/api/auth/login", { body: { username: "owner", password: "owner-pass-1", next: "https://evil.example/steal" } });
  check("Sign-in ignores an off-site ?next", r.json?.redirect === "/", JSON.stringify(r.json));
  const owner2 = r.token;

  await call("POST", "/api/auth/logout", { token: owner });
  r = await call("GET", "/api/patients", { token: owner });
  check("Signed-out session stops working", r.status === 401, r.status);
  r = await call("GET", "/api/patients", { token: owner2 });
  check("Signing out one browser leaves the other signed in", r.status === 200, r.status);

  {
    const db = peek(dbPath);
    const actions = new Set((await db.all(`SELECT DISTINCT action FROM "AuditEvent"`)).map((a) => a.action));
    const want = ["setup", "login", "login_failed", "logout", "password_change", "user_create", "user_update", "user_password_reset", "settings_update", "consult_sign", "export_all", "patient_export"];
    const missing = want.filter((a) => !actions.has(a));
    check("Activity log recorded every kind of event exercised", missing.length === 0, `missing: ${missing.join(",")}`);
    const leaks = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "AuditEvent" WHERE detail LIKE '%Seed Patient%'`)).n;
    check("Activity log holds no patient names", leaks === 0, leaks);
    const tokens = await db.all(`SELECT "tokenHash" FROM "Session"`);
    check("Sessions stored only as hashes", tokens.every((t) => /^[0-9a-f]{64}$/.test(t.tokenHash)));
    await db.close();
  }

  // ------------------------------------------------ report
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  [${x.info}]`}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
