// The front desk's list, phone search, and calling patients in — including the
// races a busy clinic will actually produce. Run by run.mjs after perm-test.cjs,
// whose accounts it signs in with:
//   node scripts/test/queue-test.cjs <test.db>
const { peek } = require("./peek.cjs");

const BASE = process.env.TEST_BASE || "http://localhost:3000";
const [dbPath] = process.argv.slice(2);
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
  const cookie = (res.headers.getSetCookie?.() || [])
    .map((c) => c.match(/^clinicos_session=([^;]*)/))
    .filter((m) => m && m[1])
    .map((m) => m[1])
    .at(-1);
  return { status: res.status, json, text, token: cookie || null };
}

(async () => {
  const login = async (username, password) => (await call("POST", "/api/auth/login", { body: { username, password } })).token;
  const owner = await login("owner", "owner-pass-1");
  const desk = await login("desk", "desk-pass-123");
  const mgr = await login("manager", "manager-pass-123");
  check("Accounts from the permission run sign in", owner && desk && mgr);

  const added = await call("POST", "/api/admin/users", { token: owner, body: { name: "Dr Third", username: "doc3", role: "doctor" } });
  const temp = added.json?.tempPassword;
  let r = await call("POST", "/api/auth/login", { body: { username: "doc3", password: temp } });
  await call("POST", "/api/auth/password", { token: r.token, body: { current: temp, next: "doc3-pass-123" } });
  const doc3 = r.token;
  check("A second doctor is ready", added.status === 200 && doc3);

  // ------------------------------------------------------------ pages by role
  r = await call("GET", "/", { token: desk });
  check("Front desk Today is the desk screen", r.status === 200 && r.text.includes("Find a returning patient") && r.text.includes("Register a new patient"), r.status);
  r = await call("GET", "/", { token: owner });
  check("Doctor Today has the waiting panel", r.status === 200 && r.text.includes("Waiting now"), r.status);
  r = await call("GET", "/patients", { token: desk });
  check("Front desk patient list offers the list button", r.text.includes("Add to today"));
  r = await call("GET", "/patients", { token: owner });
  check("Doctor patient list opens records instead", !r.text.includes("Add to today"));
  r = await call("GET", "/admin", { token: mgr });
  check("Admin sees signed consultations per doctor", r.text.includes("Consultations signed, last 7 days"));

  // ------------------------------------------------------ register + phone search
  r = await call("POST", "/api/patients", {
    token: desk,
    body: { name: "Queue Patient A", age: "52", sex: "F", phone: "98300 12345", queue: true },
  });
  const patientA = r.json?.patient?.id;
  const tokenA = r.json?.queue?.token;
  const entryA = r.json?.queue?.id;
  check("Front desk registers straight onto today's list", r.status === 200 && tokenA >= 1 && r.json?.consultId === null, JSON.stringify(r.json));

  for (const q of ["12345", "9830012345", "+91 98300 12345", "98300-12345"]) {
    r = await call("GET", `/api/patients?q=${encodeURIComponent(q)}`, { token: desk });
    check(`Phone search "${q}" finds them`, r.json?.patients?.some((p) => p.id === patientA), (r.json?.patients || []).map((p) => p.name).join(","));
  }
  r = await call("GET", "/api/patients?q=Queue%20Pat", { token: desk });
  check("Name search still works", r.json?.patients?.some((p) => p.id === patientA));
  r = await call("GET", "/api/patients?q=77777", { token: desk });
  check("A number that isn't theirs doesn't find them", !r.json?.patients?.some((p) => p.id === patientA));

  // ------------------------------------------------------------- adding people
  r = await call("POST", "/api/queue", { token: desk, body: { patientId: "seedpatient1" } });
  const entrySeed = r.json?.entry?.id;
  const tokenSeed = r.json?.entry?.token;
  check("A returning patient gets the next token", r.status === 200 && tokenSeed === tokenA + 1 && r.json?.alreadyQueued === false, JSON.stringify(r.json));
  r = await call("POST", "/api/queue", { token: desk, body: { patientId: "seedpatient1" } });
  check("Adding them twice keeps their token", r.json?.alreadyQueued === true && r.json?.entry?.token === tokenSeed, JSON.stringify(r.json));
  r = await call("POST", "/api/queue", { token: mgr, body: { patientId: "seedpatient1" } });
  check("Non-clinical admin can't add to the list", r.status === 403, r.status);
  r = await call("GET", "/api/queue", { token: mgr });
  check("Non-clinical admin can't read the list", r.status === 403, r.status);
  r = await call("POST", "/api/queue", { token: desk, body: { patientId: "no-such-patient" } });
  check("Unknown patient refused", r.status === 404, r.status);

  r = await call("GET", "/api/queue", { token: desk });
  const listed = r.json?.queue || [];
  check("List is in token order", listed.length >= 2 && listed.every((x, i, a) => i === 0 || a[i - 1].token < x.token), listed.map((x) => x.token).join(","));
  check("List carries nothing clinical", !/diagnosis|transcript|finalJson|draftJson|examination/i.test(JSON.stringify(listed)));

  const burst = await Promise.all(
    Array.from({ length: 8 }, (_, i) => call("POST", "/api/patients", { token: desk, body: { name: `Burst Patient ${i}`, queue: true } }))
  );
  const tokens = burst.map((b) => b.json?.queue?.token);
  check("Eight registrations at the same instant get eight different tokens", burst.every((b) => b.status === 200) && new Set(tokens).size === 8, tokens.join(","));

  // -------------------------------------------------------- calling patients in
  r = await call("POST", `/api/queue/${entryA}/start`, { token: desk });
  check("Front desk can't start a visit", r.status === 403, r.status);
  r = await call("POST", `/api/queue/${entryA}/start`, { token: owner });
  const consultA = r.json?.consultId;
  check("Doctor starts the visit and gets a consultation", r.status === 200 && consultA, JSON.stringify(r.json));
  r = await call("POST", `/api/queue/${entryA}/start`, { token: owner });
  check("Pressing Start again reopens the same consultation", r.json?.consultId === consultA, JSON.stringify(r.json));
  r = await call("POST", `/api/queue/${entryA}/start`, { token: doc3 });
  check("Another doctor can't take a patient already called in", r.status === 409, r.status);
  r = await call("GET", "/api/queue", { token: desk });
  const rowA = r.json?.queue?.find((x) => x.id === entryA);
  check("Desk sees which doctor has them", rowA?.status === "with-doctor" && rowA?.calledByName === "Dr Owner", JSON.stringify(rowA));
  r = await call("POST", `/api/queue/${entryA}/left`, { token: desk });
  check("A patient with the doctor can't be marked as gone", r.status === 409, r.status);
  {
    const db = peek(dbPath);
    const c = await db.get(`SELECT "patientId", "createdBy" FROM "Consult" WHERE id = ?`, consultA);
    const ownerId = (await db.get(`SELECT id FROM "User" WHERE username = 'owner'`)).id;
    check("The consultation belongs to the right patient and doctor", c?.patientId === patientA && c?.createdBy === ownerId, JSON.stringify(c));
    await db.close();
  }

  const race = await Promise.all([
    call("POST", `/api/queue/${entrySeed}/start`, { token: owner }),
    call("POST", `/api/queue/${entrySeed}/start`, { token: doc3 }),
  ]);
  check(
    "Two doctors pressing Start together: exactly one gets the patient",
    race.filter((x) => x.status === 200).length === 1 && race.filter((x) => x.status === 409).length === 1,
    race.map((x) => x.status).join(",")
  );

  const goneEntry = burst[0].json?.queue?.id;
  r = await call("POST", `/api/queue/${goneEntry}/left`, { token: desk });
  check("Desk marks a waiting patient as gone home", r.status === 200, r.status);
  r = await call("POST", `/api/queue/${goneEntry}/left`, { token: desk });
  check("Marking them gone twice is refused", r.status === 409, r.status);

  // ------------------------------------------------------- signing finishes it
  await call("POST", `/api/consults/${consultA}/consent`, { token: owner });
  r = await call("POST", `/api/consults/${consultA}/sign`, {
    token: owner,
    body: { note: { chiefComplaint: "Cough", history: "", examination: "", diagnosis: "Zebracough syndrome", medications: [], investigations: [], advice: "", followUp: "" } },
  });
  check("Doctor signs the visit", r.status === 200, r.status);
  r = await call("GET", "/api/queue", { token: desk });
  const doneA = r.json?.queue?.find((x) => x.id === entryA);
  check("Signing marks the patient as seen on the desk's list", doneA?.status === "done" && doneA?.doneAt, JSON.stringify(doneA));
  r = await call("GET", "/", { token: desk });
  check("The desk screen never shows the diagnosis", r.status === 200 && !r.text.includes("Zebracough"));

  // ------------------------------------------------------------- day boundary
  {
    const db = peek(dbPath);
    await db.run(
      `INSERT INTO "QueueEntry" (id, "patientId", day, token, status, "addedAt")
       VALUES ('old-entry-1', 'seedpatient2', '2026-01-01', 1, 'waiting', '2026-01-01T04:00:00.000Z')`
    );
    await db.close();
  }
  r = await call("GET", "/api/queue", { token: desk });
  check("An old day's list doesn't appear today", !r.json?.queue?.some((x) => x.id === "old-entry-1"));
  r = await call("POST", "/api/queue/old-entry-1/start", { token: owner });
  check("An entry from another day can't be started", r.status === 409, r.status);

  // ------------------------------------------------------------ deletion
  r = await call("DELETE", `/api/patients/${patientA}`, { token: owner, body: { confirmName: "Queue Patient A" } });
  check("Owner deletes the patient", r.status === 200, r.status);
  r = await call("GET", "/api/queue", { token: desk });
  check("Their list entry goes with them", r.status === 200 && !r.json?.queue?.some((x) => x.id === entryA));

  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  [${x.info}]`}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
