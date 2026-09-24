// Many clinics in one database: each sees only its own records, and Varaxis's
// platform console sets them up without ever opening a record. Run by run.mjs
// last, because it adds clinics and, from then on, signing in needs a clinic:
//   node scripts/test/tenancy-test.cjs <test.db>
//
// On a clinic computer (SQLite) there is one clinic and no console, and the
// suite only checks that the console is not there.
const { spawnSync } = require("child_process");
const path = require("path");
const { peek, ONLINE } = require("./peek.cjs");

const BASE = process.env.TEST_BASE || "http://localhost:3000";
const BASE_PATH = new URL(BASE).pathname.replace(/\/$/, "");
const [dbPath] = process.argv.slice(2);
const results = [];
const check = (name, ok, info = "") => results.push({ ok: !!ok, name, info: String(info) });

/** jar: { clinicos_session?, clinicos_operator? } — updated from Set-Cookie. */
async function call(method, p, { jar = {}, body } = {}) {
  const headers = {};
  const cookie = Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookie) headers.cookie = cookie;
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + (p === "/" && BASE_PATH ? "" : p), { method, headers, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  for (const c of res.headers.getSetCookie?.() || []) {
    const m = c.match(/^(clinicos_[a-z]+)=([^;]*)/);
    if (m) jar[m[1]] = m[2] || undefined;
  }
  return { status: res.status, json, text, location: res.headers.get("location") };
}

const goesTo = (r, target) =>
  (r.status >= 300 && r.status < 400 && r.location && new URL(r.location, BASE).pathname === BASE_PATH + target) ||
  r.text.includes(`NEXT_REDIRECT;replace;${target}`) ||
  r.text.includes(`NEXT_REDIRECT;push;${target}`);

const done = () => {
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  [${x.info}]`}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  // Not process.exit(): on Windows, exiting while fetch's sockets are still
  // closing trips an assertion in libuv and the run reports a crash.
  process.exitCode = failed.length ? 1 : 0;
};

(async () => {
  if (!ONLINE) {
    let r = await call("POST", "/api/platform/login", { body: { username: "x", password: "y" } });
    check("Clinic computer: the platform console does not exist", r.status === 404, r.status);
    r = await call("POST", "/api/platform/clinics", { jar: { clinicos_operator: "forged" }, body: {} });
    check("Clinic computer: a forged operator cookie reaches nothing", r.status === 404, r.status);
    return done();
  }

  // ------------------------------------------------ 1. an operator account
  const made = spawnSync(process.execPath, [path.join(__dirname, "..", "operator.mjs"), "add", "opsadmin", "Ops Admin"], {
    env: process.env,
    encoding: "utf8",
  });
  const temp = made.stdout.match(/Temporary password:\s+(\S+)/)?.[1];
  check("The operator script makes an account and prints a temporary password", made.status === 0 && temp, made.stderr || made.stdout);
  const again = spawnSync(process.execPath, [path.join(__dirname, "..", "operator.mjs"), "add", "opsadmin", "Ops Admin"], { env: process.env, encoding: "utf8" });
  check("…and refuses a second operator with the same username", again.status !== 0, again.status);

  const ops = {};
  let r = await call("POST", "/api/platform/login", { jar: ops, body: { username: "opsadmin", password: "wrong-password" } });
  check("Operator sign-in refuses a wrong password", r.status === 401 && !ops.clinicos_operator, r.status);
  r = await call("POST", "/api/platform/login", { jar: ops, body: { username: "opsadmin", password: temp } });
  check("Operator signs in with the temporary password", r.status === 200 && ops.clinicos_operator, r.status);
  check("…and is sent to choose their own", r.json?.redirect === "/platform/password", JSON.stringify(r.json));
  r = await call("POST", "/api/platform/clinics", { jar: ops, body: { name: "Too Early", slug: "too-early", plan: "cloud" } });
  check("Nothing can be done until the temporary password is replaced", r.status === 403, r.status);
  r = await call("POST", "/api/platform/password", { jar: ops, body: { current: temp, next: "short-pass" } });
  check("Operator passwords must be at least 12 characters", r.status === 400, r.status);
  r = await call("POST", "/api/platform/password", { jar: ops, body: { current: temp, next: "ops-admin-pass-2026" } });
  check("Operator chooses their own password", r.status === 200, JSON.stringify(r.json));

  // ------------------------------------------------ 2. the two sign-ins are separate
  const firstOwner = {};
  // admin-tools-test.cjs left the owner with this password.
  await call("POST", "/api/auth/login", { jar: firstOwner, body: { username: "owner", password: "owner-pass-2" } });
  check("The first clinic's owner still signs in without naming a clinic while it is the only one", firstOwner.clinicos_session);
  r = await call("GET", "/api/platform/clinics", { jar: { clinicos_session: firstOwner.clinicos_session } });
  const r2 = await call("POST", "/api/platform/clinics", { jar: { clinicos_session: firstOwner.clinicos_session }, body: {} });
  check("A clinic account cannot reach the platform console", r.status === 401 && r2.status === 401, `${r.status} ${r2.status}`);
  r = await call("GET", "/platform", { jar: { clinicos_session: firstOwner.clinicos_session } });
  check("…and its pages send it to the operator sign-in", goesTo(r, "/platform/login"), `${r.status} ${r.location}`);
  r = await call("GET", "/api/patients", { jar: { clinicos_operator: ops.clinicos_operator } });
  check("An operator cannot open a clinic's records", r.status === 401, r.status);
  r = await call("GET", "/api/queue", { jar: { clinicos_operator: ops.clinicos_operator } });
  check("…nor its day's list", r.status === 401, r.status);

  // ------------------------------------------------ 3. creating clinics
  r = await call("POST", "/api/platform/clinics", { jar: ops, body: { name: "Bad", slug: "Bad Slug!", plan: "cloud" } });
  check("A clinic ID must be a plain address", r.status === 400, r.status);
  r = await call("POST", "/api/platform/clinics", { jar: ops, body: { name: "Sneaky", slug: "platform", plan: "cloud" } });
  check("…and cannot take a name the app uses", r.status === 400, r.status);
  r = await call("POST", "/api/platform/clinics", { jar: ops, body: { name: "Sharma Clinic", slug: "sharma", plan: "cloud", paidUntil: "2027-03-31" } });
  const A = { slug: "sharma", code: r.json?.setupCode, id: r.json?.clinic?.id };
  check("Operator creates a clinic and gets its one-time setup code", r.status === 200 && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(A.code || ""), JSON.stringify(r.json));
  r = await call("POST", "/api/platform/clinics", { jar: ops, body: { name: "Roy Clinic", slug: "roy", plan: "cloud-local", localSync: true } });
  const B = { slug: "roy", code: r.json?.setupCode, id: r.json?.clinic?.id };
  check("…and a second, with clinic computer sync", r.status === 200 && B.code, JSON.stringify(r.json));
  r = await call("POST", "/api/platform/clinics", { jar: ops, body: { name: "Copy", slug: "sharma", plan: "cloud" } });
  check("Two clinics cannot share an ID", r.status === 409, r.status);
  {
    const db = peek(dbPath);
    const row = await db.get(`SELECT "setupCodeHash" FROM "Tenant" WHERE id = ?`, A.id);
    check("Only a hash of the setup code is stored", row && row.setupCodeHash && !row.setupCodeHash.includes(A.code.slice(0, 4)), row?.setupCodeHash);
    const name = await db.get(`SELECT value FROM "ClinicSetting" WHERE "clinicId" = ? AND key = 'clinic_name'`, A.id);
    check("The new clinic's printed name starts as its registered name", name?.value === "Sharma Clinic", name?.value);
    await db.close();
  }

  // ------------------------------------------------ 4. setting each clinic up
  r = await call("GET", "/c/sharma");
  check("A new clinic's address opens its setup", goesTo(r, "/setup"), `${r.status} ${r.location}`);
  r = await call("GET", "/c/nobody-here");
  check("An unknown clinic address says so", r.status === 200 && r.text.includes("No clinic at this address"), r.status);

  const owner = (code, clinic, username = "doctor", password = "doctor-pass-1") => ({
    clinic, setupCode: code, acceptTerms: clinic === "sharma", clinicName: clinic === "sharma" ? "Sharma Clinic" : "Roy Clinic",
    name: clinic === "sharma" ? "Dr Sharma" : "Dr Roy", username, password, isDoctor: true,
  });
  r = await call("POST", "/api/setup", { body: owner(undefined, "sharma") });
  check("Setup refuses without the clinic's code", r.status === 403, r.status);
  r = await call("POST", "/api/setup", { body: owner(B.code, "sharma") });
  check("…and refuses another clinic's code", r.status === 403, r.status);
  r = await call("POST", "/api/setup", { body: owner(process.env.SETUP_CODE, "sharma") });
  check("…and refuses the server's own code, which is only the first clinic's", r.status === 403, r.status);
  const a = {};
  r = await call("POST", "/api/setup", { jar: a, body: { ...owner(A.code.toLowerCase().replace(/-/g, " "), "sharma"), password: "sharma-pass-1" } });
  check("The clinic's code opens its setup, typed any old way", r.status === 200 && a.clinicos_session, JSON.stringify(r.json));
  r = await call("POST", "/api/setup", { body: { ...owner(A.code, "sharma"), username: "intruder" } });
  check("Setup refuses forever once the clinic has an account", r.status === 403 || r.status === 409, r.status);
  const b = {};
  r = await call("POST", "/api/setup", { jar: b, body: { ...owner(B.code, "roy"), password: "roy-pass-12" } });
  check("A second clinic can have the same username as the first", r.status === 200 && b.clinicos_session, JSON.stringify(r.json));
  {
    const db = peek(dbPath);
    const codes = await db.all(`SELECT "setupCodeHash" FROM "Tenant" WHERE id IN (?, ?)`, A.id, B.id);
    check("A setup code stops existing once used", codes.every((c) => c.setupCodeHash === null), JSON.stringify(codes));
    await db.close();
  }

  // ------------------------------------------------ 5. signing in to the right clinic
  r = await call("POST", "/api/auth/login", { body: { username: "doctor", password: "sharma-pass-1" } });
  check("With several clinics, signing in without one asks which", r.status === 400 && r.json?.needClinic, r.status);
  r = await call("POST", "/api/auth/login", { body: { clinic: "roy", username: "doctor", password: "sharma-pass-1" } });
  check("One clinic's password does not open the same username in another", r.status === 401, r.status);
  r = await call("POST", "/api/auth/login", { body: { clinic: "no-such-clinic", username: "doctor", password: "sharma-pass-1" } });
  check("An unknown clinic is refused", r.status === 400, r.status);
  const a2 = {};
  r = await call("POST", "/api/auth/login", { jar: a2, body: { clinic: "SHARMA", username: "Doctor", password: "sharma-pass-1" } });
  check("Signing in names the clinic, in any case", r.status === 200 && a2.clinicos_session && a2.clinicos_clinic === "sharma", JSON.stringify(r.json));
  // Through the doctor's door: online, bare /login asks who is signing in first
  // (perm-test.cjs), and the clinic's own sign-in is one tap in. Which clinic it
  // is for is worked out exactly as before.
  r = await call("GET", "/login?as=doctor", { jar: { clinicos_clinic: "sharma" } });
  check("The sign-in page remembers the clinic from the last sign-in", r.status === 200 && r.text.includes("Sharma Clinic") && !r.text.includes("Clinic ID"), r.status);
  r = await call("GET", "/login?as=doctor");
  check("…and asks for it on a browser that has never signed in", r.status === 200 && r.text.includes("Clinic ID"), r.status);
  r = await call("GET", "/login", { jar: { clinicos_clinic: "sharma" } });
  check("Asking who is signing in names no clinic", r.status === 200 && r.text.includes("Who is signing in?") && !r.text.includes("Sharma Clinic"), r.status);

  // ------------------------------------------------ 6. each clinic sees only its own
  r = await call("POST", "/api/patients", { jar: a, body: { name: "Asha Tenantcheck", age: "40", phone: "9123400001" } });
  const aPatient = r.json?.patient?.id;
  const aConsult = r.json?.consultId;
  check("Clinic A registers a patient and opens a visit", r.status === 200 && aPatient && aConsult, JSON.stringify(r.json));
  r = await call("POST", "/api/queue", { jar: a, body: { patientId: aPatient } });
  const aEntry = r.json?.entry?.id;
  check("Clinic A's first token of the day is 1", r.status === 200 && r.json?.entry?.token === 1, JSON.stringify(r.json));
  r = await call("POST", "/api/favourites", { jar: a, body: { name: "Sharma fever", plan: { diagnosis: "Fever", medications: [], investigations: [], advice: "", followUp: "" } } });
  const aFav = r.json?.favourite?.id;
  r = await call("POST", "/api/bills", { jar: a, body: { patientId: aPatient, items: [{ label: "Consultation", amount: 25000 }], pay: "cash" } });
  const aBill = r.json?.bill?.id;
  check("Clinic A's receipts start at 0001 of its own", r.status === 200 && r.json?.bill?.receiptNo === "0001", JSON.stringify(r.json));
  const aUser = (await (async () => { const db = peek(dbPath); const u = await db.get(`SELECT id FROM "User" WHERE "clinicId" = ? AND username = 'doctor'`, A.id); await db.close(); return u?.id; })());

  r = await call("POST", "/api/patients", { jar: b, body: { name: "Bina Tenantcheck", queue: true } });
  check("Clinic B's first token of the day is also 1", r.status === 200 && r.json?.queue?.token === 1, JSON.stringify(r.json));

  r = await call("GET", "/api/patients?q=Asha", { jar: b });
  check("B's search does not find A's patient by name", r.status === 200 && r.json.patients.length === 0, JSON.stringify(r.json));
  r = await call("GET", "/api/patients?q=9123400001", { jar: b });
  check("…nor by phone", r.status === 200 && r.json.patients.length === 0, JSON.stringify(r.json));
  r = await call("GET", "/api/patients?q=", { jar: b });
  check("…and B's full list has only B's patients", r.status === 200 && r.json.patients.every((p) => p.name !== "Asha Tenantcheck") && r.json.patients.length === 1, r.json?.patients?.length);
  r = await call("GET", "/api/bills/patients?q=Asha", { jar: b });
  check("…nor when billing", r.status === 200 && r.json.patients.length === 0, JSON.stringify(r.json));
  r = await call("GET", "/api/bills", { jar: b });
  check("B's bills desk shows none of A's takings", r.status === 200 && r.json.takings.total === 0 && r.json.paidToday.length === 0, JSON.stringify(r.json?.takings));
  r = await call("GET", "/api/queue", { jar: b });
  check("B's day's list has only B's patients", r.status === 200 && r.json.queue.length === 1 && r.json.queue[0].patientName === "Bina Tenantcheck", JSON.stringify(r.json?.queue?.map((q) => q.patientName)));

  const aOnly = [
    ["GET", `/patients/${aPatient}`, 404],
    ["GET", `/consult/${aConsult}`, 404],
    ["POST", "/api/consults", 404, { patientId: aPatient }],
    ["POST", `/api/consults/${aConsult}/audio/chunk?first=1`, 404],
    ["POST", `/api/consults/${aConsult}/audio/finalize`, 404, {}],
    ["PATCH", `/api/consults/${aConsult}/draft`, 404, { note: { diagnosis: "overwritten by B" } }],
    ["POST", `/api/consults/${aConsult}/note`, 404, { transcript: "x" }],
    ["POST", `/api/consults/${aConsult}/transcribe`, 404],
    ["POST", `/api/consults/${aConsult}/sign`, 404, { note: { chiefComplaint: "signed by B" } }],
    ["DELETE", `/api/patients/${aPatient}`, 404, { confirmName: "Asha Tenantcheck" }],
    ["GET", `/api/patients/${aPatient}/export`, 404],
    ["POST", "/api/queue", 404, { patientId: aPatient }],
    ["POST", `/api/queue/${aEntry}/start`, 409],
    ["POST", `/api/queue/${aEntry}/left`, 409],
    ["PATCH", `/api/admin/users/${aUser}`, 404, { active: false }],
    ["POST", `/api/admin/users/${aUser}/reset`, 404],
    ["DELETE", `/api/favourites/${aFav}`, 404],
    ["POST", `/api/favourites/${aFav}/use`, 404],
    ["GET", `/api/bills/${aBill}`, 404],
    ["GET", `/bills/${aBill}`, 404],
    ["POST", "/api/bills", 404, { patientId: aPatient, items: [{ label: "Consultation", amount: 100 }], pay: "cash" }],
    ["POST", `/api/bills/${aBill}/pay`, 404, { method: "cash" }],
    ["POST", `/api/bills/${aBill}/cancel`, 404, { reason: "B cancels A's bill", confirm: "CANCEL" }],
    ["POST", `/api/followups/${aConsult}`, 404, { action: "dismissed" }],
  ];
  const leaks = [];
  for (const [m, p, want, body] of aOnly) {
    const x = await call(m, p, { jar: { clinicos_session: b.clinicos_session }, body });
    if (x.status !== want) leaks.push(`${m} ${p}=${x.status} (want ${want})`);
  }
  check(`Clinic B reaches none of A's ${aOnly.length} records by id`, leaks.length === 0, leaks.join("; "));
  {
    const db = peek(dbPath);
    const p = await db.get(`SELECT "clinicId" FROM "Patient" WHERE id = ?`, aPatient);
    const c = await db.get(`SELECT "signedAt", "workingJson", "consentGiven" FROM "Consult" WHERE id = ?`, aConsult);
    const q = await db.get(`SELECT status FROM "QueueEntry" WHERE id = ?`, aEntry);
    const u = await db.get(`SELECT active FROM "User" WHERE id = ?`, aUser);
    const bl = await db.get(`SELECT "voidedAt", "receiptNo" FROM "Bill" WHERE id = ?`, aBill);
    const bills = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Bill" WHERE "patientId" = ?`, aPatient)).n;
    check(
      "…and A's records are exactly as A left them",
      p?.clinicId === A.id && !c?.signedAt && !c?.workingJson && q?.status === "waiting" && u?.active === 1 && bl && !bl.voidedAt && bills === 1,
      JSON.stringify({ p, c, q, u, bl, bills })
    );
    await db.close();
  }

  r = await call("GET", "/api/backup/export", { jar: b });
  check("B's full export holds none of A's records", r.status === 200 && !r.text.includes("Asha Tenantcheck") && r.text.includes("Bina Tenantcheck"), r.status);
  r = await call("GET", "/admin/audit", { jar: b });
  check("B's activity log shows none of A's activity", r.status === 200 && !r.text.includes("Dr Sharma") && r.text.includes("Dr Roy"), r.status);
  r = await call("GET", "/admin/users", { jar: b });
  check("B's People screen lists only B's people", r.status === 200 && !r.text.includes("Dr Sharma"), r.status);
  await call("POST", "/api/admin/settings", { jar: b, body: { name: "Roy Clinic Renamed", address: "", phone: "" } });
  r = await call("GET", "/admin", { jar: a });
  check("Changing B's clinic details leaves A's alone", r.status === 200 && r.text.includes("Sharma Clinic") && !r.text.includes("Roy Clinic Renamed"), r.status);
  check("A's Clinic admin shows the clinic's own address", r.text.includes("/c/sharma"), r.status);
  // The AI service is set per clinic (a temporary window in Clinic admin), and
  // its key must never come back out of the app on any clinic's screen.
  await call("POST", "/api/admin/ai", {
    jar: b,
    body: { asrProvider: "http", asrUrl: "https://example.invalid/v1/audio/transcriptions", asrModel: "whisper-tenantcheck", asrKey: "sk-tenantcheck-secret" },
  });
  r = await call("GET", "/admin", { jar: a });
  check("B's AI service does not reach A's Clinic admin", r.status === 200 && !r.text.includes("whisper-tenantcheck"), r.status);
  r = await call("GET", "/admin", { jar: b });
  check("…and B's own screen never shows the key it saved", r.status === 200 && r.text.includes("whisper-tenantcheck") && !r.text.includes("sk-tenantcheck-secret"), r.status);
  r = await call("GET", "/admin/audit", { jar: b });
  check("…and the activity log records the change without the key", r.text.includes("transcription key set") && !r.text.includes("sk-tenantcheck-secret"), r.status);
  check("…and not the first clinic's fallback address from the server's settings", !r.text.includes("Testville"), r.status);
  r = await call("POST", `/api/queue/${aEntry}/start`, { jar: a });
  check("A's own doctor can still call A's patient in", r.status === 200 && r.json?.consultId, JSON.stringify(r.json));

  // ------------------------------------------------ 7. pausing a clinic
  r = await call("PATCH", `/api/platform/clinics/${B.id}`, { jar: ops, body: { status: "suspended" } });
  check("Operator pauses clinic B", r.status === 200, JSON.stringify(r.json));
  r = await call("GET", "/api/patients?q=", { jar: b });
  check("A paused clinic's consultations and lists stop", r.status === 403, r.status);
  r = await call("GET", "/api/bills", { jar: b });
  check("…and its billing", r.status === 403, r.status);
  r = await call("GET", "/", { jar: b });
  check("…its Today says it is paused", goesTo(r, "/paused"), `${r.status} ${r.location}`);
  r = await call("GET", "/api/backup/export", { jar: b });
  check("…but whoever manages it can still export everything", r.status === 200 && r.text.includes("Bina Tenantcheck"), r.status);
  r = await call("GET", "/api/patients?q=", { jar: a });
  check("…and other clinics carry on", r.status === 200, r.status);
  r = await call("GET", "/admin/audit", { jar: b });
  check("The pause is in the clinic's own log, as Varaxis's doing", r.text.includes("Varaxis changed this clinic") && r.text.includes("Varaxis (Ops Admin)"), r.status);
  r = await call("PATCH", `/api/platform/clinics/${B.id}`, { jar: ops, body: { status: "active" } });
  const back = await call("GET", "/api/patients?q=", { jar: b });
  check("Switching it back on restores everything at once", r.status === 200 && back.status === 200 && back.json.patients.length === 1, back.status);

  // ------------------------------------------------ 8. the console shows counts, never records
  r = await call("GET", "/platform", { jar: ops });
  check("The console lists the clinics", r.status === 200 && r.text.includes("Sharma Clinic") && r.text.includes("Roy Clinic"), r.status);
  check("…and says which ones cannot record because nobody accepted the terms", r.text.includes("Terms not accepted"), r.status);
  {
    const bPatient = (await call("GET", "/api/patients?q=Bina", { jar: b })).json.patients[0].id;
    const visit = await call("POST", "/api/consults", { jar: b, body: { patientId: bPatient } });
    const rec = await call("POST", `/api/consults/${visit.json.consult.id}/audio/chunk?first=1`, { jar: b });
    check("A clinic that never accepted the terms cannot record, whatever its screens show", rec.status === 403 && rec.json?.code === "terms", JSON.stringify(rec.json));
  }
  check("…and no patient's name", !r.text.includes("Asha") && !r.text.includes("Bina"), r.status);
  r = await call("GET", `/platform/clinics/${A.id}`, { jar: ops });
  check("A clinic's page in the console shows no patient either", r.status === 200 && !r.text.includes("Asha"), r.status);
  r = await call("POST", `/api/platform/clinics/${A.id}/setup-code`, { jar: ops });
  check("A set-up clinic cannot be given a new setup code", r.status === 409, r.status);
  r = await call("PATCH", `/api/platform/clinics/${A.id}`, { jar: ops, body: { slug: "roy" } });
  check("A clinic cannot take another's ID", r.status === 409, r.status);
  r = await call("PATCH", `/api/platform/clinics/${A.id}`, { jar: ops, body: { plan: "cloud-local", localSync: true } });
  check("Operator changes a clinic's plan and switches sync on", r.status === 200, JSON.stringify(r.json));
  {
    const db = peek(dbPath);
    const t = await db.get(`SELECT plan, features FROM "Tenant" WHERE id = ?`, A.id);
    check("…and it is stored", t?.plan === "cloud-local" && JSON.parse(t.features).localSync === true, JSON.stringify(t));
    await db.close();
  }
  r = await call("GET", "/platform/activity", { jar: ops });
  check("The console's activity shows what operators did", r.status === 200 && r.text.includes("Created a clinic") && r.text.includes("Changed a clinic"), r.status);
  r = await call("POST", "/api/platform/logout", { jar: ops });
  r = await call("GET", "/api/platform/clinics", { jar: ops });
  check("Signing out ends the operator's session", r.status === 401, r.status);

  done();
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
