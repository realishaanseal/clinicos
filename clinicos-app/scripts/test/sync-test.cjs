// A clinic computer keeping in step with its clinic online. Run by run.mjs
// after tenancy-test.cjs:
//   node scripts/test/sync-test.cjs <online db> '<clinic computers as JSON>'
//
// The Postgres run starts two more copies of the app on SQLite as the clinic
// computers. The first holds records from before it was connected (a clinic
// moving online); the second is brand new and connects at setup instead (a
// second computer for a clinic already online).
//
// On the SQLite run there is no online side, and the suite only checks that
// the online end of syncing is not there.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { peek, ONLINE } = require("./peek.cjs");

const CLOUD = process.env.TEST_BASE || "http://localhost:3000";
const [cloudDb, localsJson] = process.argv.slice(2);
const locals = JSON.parse(localsJson || "[]");
const results = [];
const check = (name, ok, info = "") => results.push({ ok: !!ok, name, info: String(info) });

async function call(base, method, p, { jar = {}, body, headers = {} } = {}) {
  const h = { ...headers };
  const cookie = Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookie) h.cookie = cookie;
  let payload;
  if (body !== undefined) {
    h["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + p, { method, headers: h, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  for (const c of res.headers.getSetCookie?.() || []) {
    const m = c.match(/^(clinicos_[a-z]+)=([^;]*)/);
    if (m) jar[m[1]] = m[2] || undefined;
  }
  return { status: res.status, json, text };
}

const done = () => {
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  [${x.info}]`}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length ? 1 : 0;
};

const local = (dbPath) => {
  const db = new Database(dbPath);
  return {
    get: (sql, ...p) => db.prepare(sql).get(...p),
    all: (sql, ...p) => db.prepare(sql).all(...p),
    close: () => db.close(),
  };
};
const cloud = async (fn) => {
  const db = peek(cloudDb);
  try {
    return await fn(db);
  } finally {
    await db.close();
  }
};

const note = (over = {}) => ({
  chiefComplaint: "", history: "", examination: "", diagnosis: "", medications: [], investigations: [], advice: "", followUp: "", ...over,
});

(async () => {
  if (!ONLINE) {
    let r = await call(CLOUD, "POST", "/api/sync/hello", { headers: { authorization: "Bearer cos_nothing" } });
    check("Clinic computer: there is no online end of syncing here", r.status === 404, r.status);
    r = await call(CLOUD, "POST", "/api/sync/pull", { body: { table: "Patient" } });
    check("…and pulling without a key reaches nothing", r.status === 404, r.status);
    return done();
  }
  if (locals.length < 2) {
    // Testing an app already deployed: there are no clinic computers to drive.
    check("Sync needs clinic computers beside the online copy; this run has none, so it was not tried", true);
    return done();
  }
  const [pc1, pc2] = locals;
  let localQueue = "";

  // ------------------------------------------------ 1. a clinic computer with records of its own
  const L = {};
  let r = await call(pc1.base, "POST", "/api/setup", {
    jar: L,
    body: { setupCode: process.env.SETUP_CODE, clinicName: "Mitra Clinic", name: "Dr Mitra", username: "mitra", password: "mitra-pass-1", isDoctor: true },
  });
  check("The clinic computer is set up on its own first", r.status === 200 && L.clinicos_session, JSON.stringify(r.json));
  await call(pc1.base, "POST", "/api/admin/settings", { jar: L, body: { name: "Mitra Clinic", address: "12 Station Road", phone: "03472 000000" } });

  r = await call(pc1.base, "POST", "/api/patients", { jar: L, body: { name: "Signed Syncpatient", age: "52", phone: "9800000001" } });
  const p1 = r.json.patient.id;
  const c1 = r.json.consultId;
  await call(pc1.base, "PATCH", `/api/consults/${c1}/draft`, { jar: L, body: { note: note({ chiefComplaint: "Knee pain", diagnosis: "Osteoarthritis" }) } });
  r = await call(pc1.base, "POST", `/api/consults/${c1}/sign`, { jar: L, body: { note: note({ chiefComplaint: "Knee pain", diagnosis: "Osteoarthritis" }) } });
  check("…and signs a visit there", r.status === 200, JSON.stringify(r.json));

  r = await call(pc1.base, "POST", "/api/patients", { jar: L, body: { name: "Recorded Syncpatient", age: "30" } });
  const p2 = r.json.patient.id;
  const c2 = r.json.consultId;
  await call(pc1.base, "POST", `/api/consults/${c2}/consent`, { jar: L });
  const res = await fetch(`${pc1.base}/api/consults/${c2}/audio/chunk?first=1`, {
    method: "POST",
    headers: { cookie: `clinicos_session=${L.clinicos_session}` },
    body: Buffer.from("not really audio, but bytes all the same"),
  });
  check("…and records a visit, which stays unsigned", res.status === 200, res.status);
  const audioFile = path.join(pc1.audio, `${c2}.webm`);
  check("The recording is a file on the clinic computer", fs.existsSync(audioFile), audioFile);
  await call(pc1.base, "POST", "/api/favourites", { jar: L, body: { name: "Knee", plan: { diagnosis: "Osteoarthritis", medications: [], investigations: [], advice: "Walk daily", followUp: "" } } });
  r = await call(pc1.base, "POST", "/api/queue", { jar: L, body: { patientId: p2 } });
  check("…and has a day's list", r.status === 200 && r.json.entry.token === 1, JSON.stringify(r.json));

  // ------------------------------------------------ 2. Varaxis sets the clinic up online, with sync
  const ops = {};
  const made = spawnSync(process.execPath, [path.join(__dirname, "..", "operator.mjs"), "add", "syncops", "Sync Ops"], { env: process.env, encoding: "utf8" });
  const temp = made.stdout.match(/Temporary password:\s+(\S+)/)?.[1];
  await call(CLOUD, "POST", "/api/platform/login", { jar: ops, body: { username: "syncops", password: temp } });
  await call(CLOUD, "POST", "/api/platform/password", { jar: ops, body: { current: temp, next: "sync-ops-pass-2026" } });
  r = await call(CLOUD, "POST", "/api/platform/clinics", { jar: ops, body: { name: "Mitra Clinic (registered)", slug: "mitra", plan: "cloud", localSync: false } });
  const clinicId = r.json?.clinic?.id;
  check("Operator creates the clinic online", r.status === 200 && clinicId, JSON.stringify(r.json));
  r = await call(CLOUD, "POST", `/api/platform/clinics/${clinicId}/devices`, { jar: ops, body: { name: "Front desk PC" } });
  check("A clinic computer key is refused while the plan does not include it", r.status === 409, r.status);
  await call(CLOUD, "PATCH", `/api/platform/clinics/${clinicId}`, { jar: ops, body: { plan: "cloud-local", localSync: true } });
  r = await call(CLOUD, "POST", `/api/platform/clinics/${clinicId}/devices`, { jar: ops, body: { name: "Front desk PC" } });
  const key1 = r.json?.key;
  check("Once it does, Varaxis makes a key for the clinic's computer", r.status === 200 && /^cos_/.test(key1 || ""), JSON.stringify(r.json));
  await cloud(async (db) => {
    const d = await db.get(`SELECT "keyHash" FROM "SyncDevice" WHERE "clinicId" = ?`, clinicId);
    check("Only a hash of the key is kept online", d && d.keyHash && !d.keyHash.includes(key1.slice(4, 14)), d?.keyHash);
  });

  // ------------------------------------------------ 3. connecting
  const address = `${CLOUD}/c/mitra`;
  r = await call(pc1.base, "POST", "/api/admin/sync", { jar: L, body: { url: address, key: "cos_wrong" } });
  check("A wrong key is refused", r.status === 400 && /key/i.test(r.json?.error || ""), JSON.stringify(r.json));
  r = await call(pc1.base, "POST", "/api/admin/sync", { jar: L, body: { url: address, key: key1 } });
  check("Connecting to the online prototype needs the clinic to say its patients are made up", r.status === 409 && r.json?.prototype, JSON.stringify(r.json));
  r = await call(pc1.base, "POST", "/api/admin/sync", { jar: L, body: { url: address, key: key1, madeUpOnly: true } });
  check("The clinic computer connects", r.status === 200 && r.json?.clinic?.slug === "mitra", JSON.stringify(r.json));
  r = await call(pc1.base, "POST", "/api/admin/sync/run", { jar: L });
  check("The first sync runs", r.status === 200 && r.json?.report?.sent > 0, JSON.stringify(r.json?.report ?? r.json));

  await cloud(async (db) => {
    const pats = (await db.all(`SELECT name FROM "Patient" WHERE "clinicId" = ? ORDER BY name`, clinicId)).map((p) => p.name);
    check("Its patients are now online, in its own clinic", pats.join(",") === "Recorded Syncpatient,Signed Syncpatient", pats.join(","));
    const c = await db.get(`SELECT "signedAt", "finalJson", "audioPath" FROM "Consult" WHERE id = ? AND "clinicId" = ?`, c1, clinicId);
    check("…with the signed visit exactly as signed", c && c.signedAt && JSON.parse(c.finalJson).diagnosis === "Osteoarthritis", JSON.stringify(c));
    const rec = await db.get(`SELECT "audioPath", "consentGiven" FROM "Consult" WHERE id = ?`, c2);
    const chunks = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "AudioChunk" WHERE "consultId" = ?`, c2)).n;
    check("The recording never left the clinic computer", rec && rec.audioPath === null && rec.consentGiven === 1 && chunks === 0, JSON.stringify({ rec, chunks }));
    const u = await db.get(`SELECT username, role FROM "User" WHERE "clinicId" = ?`, clinicId);
    check("The clinic computer's accounts are online too", u?.username === "mitra" && u.role === "doctor", JSON.stringify(u));
    const name = await db.get(`SELECT value FROM "ClinicSetting" WHERE "clinicId" = ? AND key = 'clinic_name'`, clinicId);
    const addr = await db.get(`SELECT value FROM "ClinicSetting" WHERE "clinicId" = ? AND key = 'clinic_address'`, clinicId);
    check("The clinic's own name and address replace what Varaxis typed", name?.value === "Mitra Clinic" && addr?.value === "12 Station Road", `${name?.value} / ${addr?.value}`);
    const fav = await db.get(`SELECT name FROM "Favourite" WHERE "clinicId" = ?`, clinicId);
    const q = await db.get(`SELECT token, status FROM "QueueEntry" WHERE "clinicId" = ? AND "patientId" = ?`, clinicId, p2);
    const edits = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "AuditEvent" WHERE "clinicId" = ? AND action = 'consult_sign'`, clinicId)).n;
    check("…with the favourite, the day's list and the activity log", fav?.name === "Knee" && q?.token === 1 && edits === 1, JSON.stringify({ fav, q, edits }));
    const setup = await db.get(`SELECT "setupCodeHash" FROM "Tenant" WHERE id = ?`, clinicId);
    check("The clinic's online setup is closed now it has accounts", setup && setup.setupCodeHash, "setup code kept but unusable");
  });
  r = await call(CLOUD, "POST", "/api/setup", { body: { clinic: "mitra", setupCode: "ANY", clinicName: "X", name: "X", username: "intruder", password: "intruder-pass" } });
  check("…and cannot be used to add an owner", r.status === 403 || r.status === 409, r.status);

  const O = {};
  r = await call(CLOUD, "POST", "/api/auth/login", { jar: O, body: { clinic: "mitra", username: "mitra", password: "mitra-pass-1" } });
  check("The doctor signs in online with the password from the clinic computer", r.status === 200 && O.clinicos_session, JSON.stringify(r.json));

  // ------------------------------------------------ 4. online work comes back to the clinic computer
  r = await call(CLOUD, "POST", `/api/consults/${c2}/sign`, { jar: O, body: { note: note({ chiefComplaint: "Headache", diagnosis: "Tension headache" }) } });
  check("The recorded visit is signed online", r.status === 200, JSON.stringify(r.json));
  // Both desks put a new patient on today's list before the next sync: each
  // hands out token 2. The clinic computer's was first.
  r = await call(pc1.base, "POST", "/api/patients", { jar: L, body: { name: "Walkin Syncpatient", queue: true } });
  const pW = r.json?.patient?.id;
  check("The clinic computer's desk gives a walk-in token 2", r.status === 200 && r.json.queue?.token === 2, JSON.stringify(r.json));
  r = await call(CLOUD, "POST", "/api/patients", { jar: O, body: { name: "Online Syncpatient", age: "8", queue: true } });
  const p3 = r.json?.patient?.id;
  check("…and the online desk, a moment later, gives token 2 too", r.status === 200 && r.json.queue?.token === 2, JSON.stringify(r.json));
  await call(CLOUD, "POST", "/api/admin/settings", { jar: O, body: { name: "Mitra Clinic", address: "12 Station Road, Krishnapur", phone: "03472 000000" } });

  r = await call(pc1.base, "POST", "/api/admin/sync/run", { jar: L });
  check("The clinic computer syncs", r.status === 200, JSON.stringify(r.json));
  {
    const db = local(pc1.db);
    const c = db.get(`SELECT "signedAt", "finalJson", "audioPath", "audioDeletedAt" FROM Consult WHERE id = ?`, c2);
    check("The visit signed online is signed on the clinic computer", c && c.signedAt && JSON.parse(c.finalJson).diagnosis === "Tension headache", JSON.stringify(c));
    check("…and its recording there is deleted, as promised when it was made", !fs.existsSync(audioFile) && c.audioPath === null && c.audioDeletedAt, JSON.stringify({ exists: fs.existsSync(audioFile), c }));
    const p = db.get(`SELECT name FROM Patient WHERE id = ?`, p3);
    check("The patient registered online is on the clinic computer", p?.name === "Online Syncpatient", JSON.stringify(p));
    const queue = db.all(`SELECT token, "patientId" FROM QueueEntry ORDER BY token`).map((x) => `${x.token}:${x.patientId}`).join(",");
    check("Token 2 stays with whoever was added first; the other becomes 3", queue === `1:${p2},2:${pW},3:${p3}`, queue);
    localQueue = queue;
    const addr = db.get(`SELECT value FROM ClinicSetting WHERE key = 'clinic_address'`);
    check("Clinic details changed online arrive", addr?.value === "12 Station Road, Krishnapur", addr?.value);
    const others = db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM Patient WHERE name LIKE '%Tenantcheck%'`).n;
    check("Nothing from any other clinic reaches the clinic computer", others === 0, others);
    db.close();
  }
  await cloud(async (db) => {
    const q = (await db.all(`SELECT token, "patientId" FROM "QueueEntry" WHERE "clinicId" = ? ORDER BY token`, clinicId))
      .map((x) => `${x.token}:${x.patientId}`).join(",");
    check("…the same numbers online as on the clinic computer", q === localQueue, `${q} vs ${localQueue}`);
  });
  r = await call(pc1.base, "GET", "/api/admin/sync", { jar: L });
  check("The clinic computer reports being in step, with the clash it resolved", r.status === 200 && r.json.connected && r.json.lastOkAt && r.json.conflicts.some((c) => /Token 2/.test(c.text)), JSON.stringify(r.json));

  // ------------------------------------------------ 5. which version wins
  r = await call(pc1.base, "POST", "/api/consults", { jar: L, body: { patientId: p3 } });
  const c4 = r.json.consult.id;
  await call(pc1.base, "PATCH", `/api/consults/${c4}/draft`, { jar: L, body: { note: note({ chiefComplaint: "Typed on the clinic computer" }) } });
  await call(pc1.base, "POST", "/api/admin/sync/run", { jar: L });
  await new Promise((res) => setTimeout(res, 20));
  await call(CLOUD, "PATCH", `/api/consults/${c4}/draft`, { jar: O, body: { note: note({ chiefComplaint: "Typed online, later" }) } });
  await call(pc1.base, "POST", "/api/admin/sync/run", { jar: L });
  {
    const db = local(pc1.db);
    const w = JSON.parse(db.get(`SELECT "workingJson" FROM Consult WHERE id = ?`, c4).workingJson);
    check("When a draft changes in both places, the later change is kept", w.chiefComplaint === "Typed online, later", w.chiefComplaint);
    db.close();
  }
  r = await call(pc1.base, "POST", `/api/consults/${c4}/sign`, { jar: L, body: { note: note({ chiefComplaint: "Signed on the clinic computer", diagnosis: "Viral fever" }) } });
  await call(CLOUD, "PATCH", `/api/consults/${c4}/draft`, { jar: O, body: { note: note({ chiefComplaint: "Still typing online" }) } });
  await call(pc1.base, "POST", "/api/admin/sync/run", { jar: L });
  await cloud(async (db) => {
    const c = await db.get(`SELECT "signedAt", "finalJson", "workingJson" FROM "Consult" WHERE id = ?`, c4);
    check("A signature beats any unsigned change, wherever it was made", c?.signedAt && JSON.parse(c.finalJson).chiefComplaint === "Signed on the clinic computer" && c.workingJson === null, JSON.stringify(c));
  });
  r = await call(CLOUD, "PATCH", `/api/consults/${c4}/draft`, { jar: O, body: { note: note({ chiefComplaint: "too late" }) } });
  check("…and then online refuses to change it too", r.status === 409, r.status);

  // ------------------------------------------------ 5b. sharing with the patient, from the clinic computer
  r = await call(pc1.base, "POST", `/api/consults/${c1}/share`, { jar: L, body: { consent: true } });
  const shareCode = r.json?.code;
  check("A connected clinic computer shares a signed visit through its clinic online", r.status === 200 && shareCode && r.json.portalUrl === `${CLOUD}/p`, JSON.stringify(r.json));
  r = await call(CLOUD, "POST", "/api/portal/start", { body: { phone: "9800000001", code: shareCode, pin: "246810" } });
  check("…and the patient opens it online with the printed code", r.status === 200, JSON.stringify(r.json));
  await call(pc1.base, "POST", "/api/admin/sync/run", { jar: L });
  {
    const db = local(pc1.db);
    const s = db.get(`SELECT "sharedAt", "phoneHmac", "codeHash", "payloadEnc" FROM PortalShare WHERE "consultId" = ?`, c1);
    check("The clinic computer learns it was shared, without the share's secrets", s && s.sharedAt && s.phoneHmac === null && s.codeHash === null && s.payloadEnc === null, JSON.stringify(s));
    db.close();
  }

  // ------------------------------------------------ 6. deletions travel
  r = await call(CLOUD, "DELETE", `/api/patients/${p3}`, { jar: O, body: { confirmName: "Online Syncpatient" } });
  check("A patient is deleted online", r.status === 200, JSON.stringify(r.json));
  r = await call(pc1.base, "DELETE", `/api/patients/${p1}`, { jar: L, body: { confirmName: "Signed Syncpatient" } });
  check("…and another on the clinic computer", r.status === 200, JSON.stringify(r.json));
  await call(pc1.base, "POST", "/api/admin/sync/run", { jar: L });
  {
    const db = local(pc1.db);
    const gone = db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM Patient WHERE id = ?`, p3).n;
    const visits = db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM Consult WHERE id = ?`, c4).n;
    check("The patient deleted online is gone from the clinic computer, with their visits", gone === 0 && visits === 0, `${gone} ${visits}`);
    db.close();
  }
  await cloud(async (db) => {
    const gone = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Patient" WHERE id = ?`, p1)).n;
    const visits = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Consult" WHERE id = ?`, c1)).n;
    check("The patient deleted on the clinic computer is gone online, with their visits", gone === 0 && visits === 0, `${gone} ${visits}`);
  });

  // ------------------------------------------------ 7. a key opens its own clinic and nothing else
  const other = await cloud((db) => db.get(`SELECT id, "clinicId", name FROM "Patient" WHERE name = 'Asha Tenantcheck'`));
  const hdr = { authorization: `Bearer ${key1}` };
  r = await call(CLOUD, "POST", "/api/sync/push", { headers: hdr, body: { table: "Patient", rows: [{ id: other.id, name: "Taken over", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2099-01-01T00:00:00.000Z" }] } });
  await cloud(async (db) => {
    const p = await db.get(`SELECT name, "clinicId" FROM "Patient" WHERE id = ?`, other.id);
    check("A clinic computer cannot overwrite another clinic's patient", p.name === "Asha Tenantcheck" && p.clinicId === other.clinicId, JSON.stringify(p));
  });
  check("…and is told it was refused", r.status === 200 && r.json.conflicts.length === 1, JSON.stringify(r.json));
  r = await call(CLOUD, "POST", "/api/sync/push", {
    headers: hdr,
    body: { table: "Consult", rows: [{ id: "sneaky-visit", patientId: other.id, consentGiven: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] },
  });
  check("…nor add a visit to another clinic's patient", r.status === 200 && r.json.accepted === 0, JSON.stringify(r.json));
  r = await call(CLOUD, "POST", "/api/sync/push", { headers: hdr, body: { table: "SyncTombstone", rows: [{ tableName: "Patient", rowId: other.id }] } });
  await cloud(async (db) => {
    const still = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Patient" WHERE id = ?`, other.id)).n;
    check("…nor delete one", still === 1, still);
  });
  r = await call(CLOUD, "POST", "/api/sync/pull", { headers: hdr, body: { table: "Patient", after: null, limit: 300 } });
  check("Pulling returns only its own clinic's patients", r.status === 200 && r.json.rows.every((p) => p.name.includes("Syncpatient")), JSON.stringify(r.json?.rows?.map((p) => p.name)));
  r = await call(CLOUD, "POST", "/api/sync/pull", { body: { table: "Patient" } });
  check("Pulling without a key is refused", r.status === 401, r.status);
  r = await call(CLOUD, "GET", "/api/admin/devices", { jar: O });
  check("The clinic's admin sees the connected computer online, without its key", r.status === 200 && r.json.devices.length === 1 && !JSON.stringify(r.json).includes("keyHash"), JSON.stringify(r.json));

  // ------------------------------------------------ 8. a second computer, brand new, connects at setup
  r = await call(CLOUD, "POST", "/api/admin/devices", { jar: O, body: { name: "Consulting room laptop" } });
  const key2 = r.json?.key;
  check("The clinic's admin makes a key for a second computer online", r.status === 200 && key2, JSON.stringify(r.json));
  r = await call(pc2.base, "GET", "/setup");
  check("A new clinic computer offers connecting instead of setting up", r.status === 200 && r.text.includes("Connect this computer to it instead"), r.status);
  r = await call(pc2.base, "POST", "/api/setup/connect", { body: { url: `${CLOUD}/`, key: key2, madeUpOnly: true } });
  check("It connects and fetches the clinic", r.status === 200 && r.json.fetched > 0, JSON.stringify(r.json));
  const L2 = {};
  r = await call(pc2.base, "POST", "/api/auth/login", { jar: L2, body: { username: "mitra", password: "mitra-pass-1" } });
  check("…and the doctor signs in there with the same password", r.status === 200 && L2.clinicos_session, JSON.stringify(r.json));
  r = await call(pc2.base, "GET", "/api/patients?q=", { jar: L2 });
  check("…and finds the clinic's patients", r.status === 200 && r.json.patients.some((p) => p.name === "Recorded Syncpatient") && !r.json.patients.some((p) => p.name === "Signed Syncpatient"), JSON.stringify(r.json?.patients?.map((p) => p.name)));
  r = await call(pc2.base, "POST", "/api/setup/connect", { body: { url: CLOUD, key: key2, madeUpOnly: true } });
  check("Connecting at setup closes once the computer has accounts", r.status === 409, r.status);

  // ------------------------------------------------ 9. switching a computer off
  const dev = (await call(CLOUD, "GET", "/api/admin/devices", { jar: O })).json.devices.find((d) => d.name === "Front desk PC");
  r = await call(CLOUD, "DELETE", `/api/admin/devices/${dev.id}`, { jar: O });
  check("The clinic's admin switches the first computer off", r.status === 200, JSON.stringify(r.json));
  r = await call(pc1.base, "POST", "/api/admin/sync/run", { jar: L });
  check("Its next sync is refused, with the reason", r.status === 502 && /switched off/.test(r.json?.error || ""), JSON.stringify(r.json));
  r = await call(pc1.base, "GET", "/api/patients?q=", { jar: L });
  check("…and it keeps working on its own", r.status === 200 && r.json.patients.length >= 1, r.status);
  await call(CLOUD, "PATCH", `/api/platform/clinics/${clinicId}`, { jar: ops, body: { localSync: false } });
  r = await call(pc2.base, "POST", "/api/admin/sync/run", { jar: L2 });
  check("With sync taken off the plan, the second computer is refused too", r.status === 502 && /plan/.test(r.json?.error || ""), JSON.stringify(r.json));
  r = await call(pc2.base, "DELETE", "/api/admin/sync", { jar: L2 });
  r = await call(pc2.base, "GET", "/api/admin/sync", { jar: L2 });
  check("A clinic computer can stop keeping in step, and keeps its records", r.status === 200 && !r.json.connected, JSON.stringify(r.json));

  done();
})().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
