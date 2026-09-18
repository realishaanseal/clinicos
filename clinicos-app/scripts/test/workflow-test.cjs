// The doctor's speed features: a visit written by hand without recording,
// repeating the last visit's medicines, favourites, search from anywhere and
// the timing of each step. Run by run.mjs after queue-test.cjs, whose accounts
// it signs in with:
//   node scripts/test/workflow-test.cjs <test.db>
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
  const res = await fetch(BASE + (path === "/" && new URL(BASE).pathname.length > 1 ? "" : path), { method, headers, body: payload, redirect: "manual" });
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

const emptyNote = { chiefComplaint: "", history: "", examination: "", diagnosis: "", medications: [], investigations: [], advice: "", followUp: "" };

(async () => {
  const login = async (username, password) => (await call("POST", "/api/auth/login", { body: { username, password } })).token;
  const owner = await login("owner", "owner-pass-1");
  const desk = await login("desk", "desk-pass-123");
  const mgr = await login("manager", "manager-pass-123");
  const doc3 = await login("doc3", "doc3-pass-123");
  check("Accounts from the earlier runs sign in", owner && desk && mgr && doc3);

  // ------------------------------------------------ 1. a visit written by hand
  let r = await call("POST", "/api/patients", { token: owner, body: { name: "Handwritten Patient", age: "34", phone: "9000011111" } });
  const hwPatient = r.json?.patient?.id;
  const hw = r.json?.consultId;
  check("A doctor registering a walk-in gets a consultation", r.status === 200 && hw, JSON.stringify(r.json));

  r = await call("GET", `/consult/${hw}`, { token: owner });
  check("A new visit offers writing the note without recording", r.status === 200 && r.text.includes("Write the note without recording"), r.status);

  r = await call("POST", `/api/consults/${hw}/audio/chunk?first=1`, { token: owner });
  check("Writing by hand does not open the microphone gate: recording still needs consent", r.status === 403, r.status);

  const typed = {
    ...emptyNote,
    chiefComplaint: "Dry cough for two days",
    diagnosis: "Upper respiratory infection",
    medications: [{ name: "Syrup Example", dose: "5ml", frequency: "TDS", duration: "5 days", instructions: "After food" }],
  };
  r = await call("PATCH", `/api/consults/${hw}/draft`, { token: owner, body: { note: typed } });
  check("A hand-written note autosaves with no recording and no consent", r.status === 200, r.status);

  r = await call("GET", `/consult/${hw}`, { token: owner });
  check("Reopening it lands back in the hand-written note, not the consent step", r.text.includes("Writing the note by hand") && !r.text.includes("Read aloud to the patient"), r.status);

  r = await call("POST", `/api/consults/${hw}/sign`, { token: owner, body: { note: emptyNote } });
  check("An empty note cannot be signed", r.status === 400, `${r.status} ${JSON.stringify(r.json)}`);
  r = await call("POST", `/api/consults/${hw}/sign`, { token: desk, body: { note: typed } });
  check("Front desk cannot sign a hand-written note either", r.status === 403, r.status);

  r = await call("POST", `/api/consults/${hw}/sign`, {
    token: owner,
    body: { note: { ...typed, injected: "<script>", medications: [{ ...typed.medications[0], dose: 5 }] } },
  });
  check("Signing a hand-written note says so, with no corrections counted", r.status === 200 && r.json?.handwritten === true && r.json?.editCount === null, JSON.stringify(r.json));
  {
    const db = peek(dbPath);
    const c = await db.get(`SELECT "consentGiven", "draftJson", "finalJson", "signedAt" FROM "Consult" WHERE id = ?`, hw);
    const edits = (await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "Edit" WHERE "consultId" = ?`, hw)).n;
    const final = JSON.parse(c?.finalJson || "{}");
    check("No correction rows: there was no AI draft to correct", edits === 0, edits);
    check("It stays a visit without consent to record, and without a draft", c?.consentGiven === 0 && c?.draftJson === null && !!c?.signedAt, JSON.stringify(c));
    check("The signed note keeps only the note's own fields, all as text", !("injected" in final) && final.medications?.[0]?.dose === "5", c?.finalJson);
    const audit = await db.get(`SELECT detail FROM "AuditEvent" WHERE action = 'consult_sign' AND "targetId" = ?`, hw);
    check("The activity log says it was written by hand", /written by hand/.test(audit?.detail || ""), audit?.detail);
    await db.close();
  }

  r = await call("POST", `/api/consults/${hw}/note`, { token: owner, body: { transcript: "Doctor: anything else?" } });
  check("A signed visit cannot be drafted again", r.status === 409, r.status);
  r = await call("POST", `/api/consults/${hw}/transcribe`, { token: owner });
  check("A signed visit cannot be transcribed again", r.status === 409, r.status);
  r = await call("POST", `/api/consults/${hw}/sign`, { token: owner, body: { note: typed } });
  check("A signed visit cannot be signed twice", r.status === 409, r.status);

  r = await call("GET", `/patients/${hwPatient}`, { token: owner });
  check("The patient's history marks the visit as written by hand", r.text.includes("Written by hand"), r.status);
  r = await call("GET", "/", { token: owner });
  check("Time saved on Today counts only AI-drafted notes", r.text.includes("per AI-drafted note"), r.status);

  // ------------------------------------------- 2. repeat the last visit's medicines
  r = await call("POST", "/api/consults", { token: owner, body: { patientId: "seedpatient1" } });
  const followUp = r.json?.consult?.id;
  r = await call("GET", `/consult/${followUp}`, { token: owner });
  check(
    "A returning patient's visit shows their last signed visit, as signed",
    r.text.includes("Last visit") && r.text.includes("Gastritis, likely NSAID related") && r.text.includes("Paracetamol"),
    r.status
  );
  check("…as a reminder only, before any note exists", !r.text.includes("Repeat these medicines"));
  await call("PATCH", `/api/consults/${followUp}/draft`, { token: owner, body: { note: { ...emptyNote, chiefComplaint: "Follow-up" } } });
  r = await call("GET", `/consult/${followUp}`, { token: owner });
  check("Once the note is open, its medicines can be repeated", r.text.includes("Repeat these medicines"));

  r = await call("POST", "/api/consults", { token: owner, body: { patientId: hwPatient } });
  const hwFollowUp = r.json?.consult?.id;
  await call("PATCH", `/api/consults/${hwFollowUp}/draft`, { token: owner, body: { note: { ...emptyNote, chiefComplaint: "Cough better" } } });
  r = await call("GET", `/consult/${hwFollowUp}`, { token: owner });
  check("A hand-written visit's medicines can be repeated too", r.text.includes("Syrup Example") && r.text.includes("Repeat these medicines"));

  r = await call("POST", "/api/patients", { token: owner, body: { name: "First Visit Patient" } });
  r = await call("GET", `/consult/${r.json?.consultId}`, { token: owner });
  check("A first visit shows no last visit", r.status === 200 && !r.text.includes("Last visit"), r.status);
  r = await call("GET", `/consult/${hw}`, { token: owner });
  check("A signed visit does not offer to repeat anything", !r.text.includes("Repeat these medicines"));

  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  [${x.info}]`}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
