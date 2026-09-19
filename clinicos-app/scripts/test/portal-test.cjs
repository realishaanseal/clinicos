// The patient portal (v0.5 Part C): a doctor shares a signed visit, with the
// patient's consent, and the patient reads it on their phone. Run by run.mjs:
//   node scripts/test/portal-test.cjs <online db>
//
// On a clinic computer (SQLite) there is no portal, and a visit cannot be
// shared unless the computer is connected to its clinic online.
const { spawnSync } = require("child_process");
const path = require("path");
const { peek, ONLINE } = require("./peek.cjs");

const BASE = process.env.TEST_BASE || "http://localhost:3000";
const [dbPath] = process.argv.slice(2);
const results = [];
const check = (name, ok, info = "") => results.push({ ok: !!ok, name, info: String(info) });

async function call(method, p, { jar = {}, body } = {}) {
  const headers = {};
  const cookie = Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookie) headers.cookie = cookie;
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + p, { method, headers, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  for (const c of res.headers.getSetCookie?.() || []) {
    const m = c.match(/^(clinicos_[a-z]+)=([^;]*)/);
    if (m) jar[m[1]] = m[2] || undefined;
  }
  return { status: res.status, json, text, location: res.headers.get("location") };
}
const done = () => {
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  [${x.info}]`}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length ? 1 : 0;
};
const note = (over = {}) => ({
  chiefComplaint: "", history: "", examination: "", diagnosis: "", medications: [], investigations: [], advice: "", followUp: "", ...over,
});
const db = async (fn) => {
  const d = peek(dbPath);
  try {
    return await fn(d);
  } finally {
    await d.close();
  }
};

(async () => {
  if (!ONLINE) {
    const owner = {};
    await call("POST", "/api/auth/login", { jar: owner, body: { username: "owner", password: "owner-pass-2" } });
    let r = await call("POST", "/api/patients", { jar: owner, body: { name: "Unshared Patient", phone: "9811100000" } });
    const cid = r.json?.consultId;
    await call("POST", `/api/consults/${cid}/sign`, { jar: owner, body: { note: note({ chiefComplaint: "Cold" }) } });
    r = await call("POST", `/api/consults/${cid}/share`, { jar: owner, body: { consent: true } });
    check("Clinic computer, not connected: sharing says it needs ClinicOS online", r.status === 409 && /connected/.test(r.json?.error || ""), JSON.stringify(r.json));
    r = await call("GET", "/p");
    check("Clinic computer: there is no patient portal", r.status === 404, r.status);
    return done();
  }

  // ------------------------------------------------ a clinic, a doctor, a signed visit
  const ops = {};
  const made = spawnSync(process.execPath, [path.join(__dirname, "..", "operator.mjs"), "add", "portalops", "Portal Ops"], { env: process.env, encoding: "utf8" });
  const temp = made.stdout.match(/Temporary password:\s+(\S+)/)?.[1];
  await call("POST", "/api/platform/login", { jar: ops, body: { username: "portalops", password: temp } });
  await call("POST", "/api/platform/password", { jar: ops, body: { current: temp, next: "portal-ops-pass-2026" } });
  let r = await call("POST", "/api/platform/clinics", { jar: ops, body: { name: "Das Clinic", slug: "das", plan: "cloud" } });
  const code0 = r.json?.setupCode;
  const D = {};
  r = await call("POST", "/api/setup", { jar: D, body: { clinic: "das", setupCode: code0, clinicName: "Das Clinic", name: "Dr Das", username: "das", password: "das-pass-123", isDoctor: true, qualification: "MBBS" } });
  check("A clinic is set up for the portal suite", r.status === 200 && D.clinicos_session, JSON.stringify(r.json));

  r = await call("POST", "/api/patients", { jar: D, body: { name: "Mina Portalcheck", age: "34", sex: "F", phone: "+91 98300 12345" } });
  const patientId = r.json.patient.id;
  const v1 = r.json.consultId;
  r = await call("POST", `/api/consults/${v1}/share`, { jar: D, body: { consent: true } });
  check("An unsigned visit cannot be shared", r.status === 409, r.status);
  await call("POST", `/api/consults/${v1}/sign`, {
    jar: D,
    body: { note: note({ chiefComplaint: "Fever and body ache", diagnosis: "Viral fever", medications: [{ name: "Paracetamol", dose: "650mg", frequency: "TDS", duration: "3 days", instructions: "After food" }] }) },
  });
  r = await call("POST", `/api/consults/${v1}/share`, { jar: D, body: {} });
  check("Sharing needs the patient's consent, said so", r.status === 400 && /Ask the patient/.test(r.json?.error || ""), JSON.stringify(r.json));

  r = await call("POST", "/api/patients", { jar: D, body: { name: "No Phone Portalcheck" } });
  const noPhone = r.json.consultId;
  await call("POST", `/api/consults/${noPhone}/sign`, { jar: D, body: { note: note({ chiefComplaint: "Cough" }) } });
  r = await call("POST", `/api/consults/${noPhone}/share`, { jar: D, body: { consent: true } });
  check("A patient with no phone number cannot be shared with", r.status === 400 && /phone/.test(r.json?.error || ""), JSON.stringify(r.json));

  r = await call("POST", `/api/consults/${v1}/share`, { jar: D, body: { consent: true } });
  const code1 = r.json?.code;
  check("The doctor shares the signed visit and gets a code to print", r.status === 200 && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(code1 || "") && /\/p$/.test(r.json?.portalUrl || ""), JSON.stringify(r.json));
  r = await call("GET", `/consult/${v1}`, { jar: D });
  check("The visit shows it is shared", r.status === 200 && r.text.includes("Shared"), r.status);

  await db(async (d) => {
    const s = await d.get(`SELECT "payloadEnc", "phoneHmac", "codeHash", "consentBy" FROM "PortalShare" WHERE "consultId" = ?`, v1);
    check("The shared prescription is stored encrypted", s && s.payloadEnc.startsWith("v1:") && !s.payloadEnc.includes("Viral") && !s.payloadEnc.includes("Mina"), s?.payloadEnc?.slice(0, 20));
    check("…the phone number only as an HMAC, and the code only as a hash", s && !s.phoneHmac.includes("9830012345") && s.codeHash.length === 64 && !s.codeHash.includes(code1.replace(/-/g, "")), JSON.stringify({ p: s?.phoneHmac?.slice(0, 8) }));
    check("…with who asked the patient", s && /Dr Das/.test(s.consentBy), s?.consentBy);
    const a = await d.get(`SELECT detail FROM "AuditEvent" WHERE action = 'consult_share' AND "targetId" = ?`, v1);
    check("Sharing is in the clinic's log, without the patient's name", a && !a.detail.includes("Mina"), a?.detail);
  });

  // ------------------------------------------------ the patient signs in
  const P = {};
  r = await call("POST", "/api/portal/start", { jar: P, body: { phone: "9830012346", code: code1, pin: "123456" } });
  check("A code with the wrong phone number is refused", r.status === 401 && !P.clinicos_patient, r.status);
  r = await call("POST", "/api/portal/start", { jar: P, body: { phone: "98300 12345", code: code1.toLowerCase(), pin: "12345" } });
  check("A PIN must be 6 digits", r.status === 400, r.status);
  r = await call("POST", "/api/portal/start", { jar: P, body: { phone: "098300-12345", code: code1.toLowerCase(), pin: "482913" } });
  check("The patient opens it with their phone, however typed, and the code, and sets a PIN", r.status === 200 && P.clinicos_patient, JSON.stringify(r.json));
  r = await call("GET", "/p", { jar: P });
  check("They see the prescription in their list", r.status === 200 && r.text.includes("Viral fever") && r.text.includes("Das Clinic"), r.status);
  const shareId = await db(async (d) => (await d.get(`SELECT id FROM "PortalShare" WHERE "consultId" = ?`, v1)).id);
  r = await call("GET", `/p/visits/${shareId}`, { jar: P });
  check("…and open it, exactly as printed", r.status === 200 && r.text.includes("Paracetamol") && r.text.includes("Dr Das") && r.text.includes("Mina Portalcheck"), r.status);
  check("…with nothing from outside the prescription", !r.text.includes("transcript") && !r.text.includes("98300"), r.status);

  r = await call("GET", "/api/patients", { jar: { clinicos_patient: P.clinicos_patient } });
  check("A patient's sign-in opens nothing in the clinic", r.status === 401, r.status);
  r = await call("GET", "/p", { jar: { clinicos_session: D.clinicos_session } });
  check("A clinic's sign-in opens no patient's prescriptions", r.status === 200 && !r.text.includes("Viral fever"), r.status);
  r = await call("GET", `/p/visits/${shareId}`, { jar: { clinicos_session: D.clinicos_session } });
  check("…not even by the direct address", r.status !== 200 || !r.text.includes("Viral fever"), r.status);

  // ------------------------------------------------ PIN, lockout, reset
  await call("POST", "/api/portal/logout", { jar: P });
  r = await call("GET", "/p", { jar: P });
  check("Signing out ends it", r.status === 200 && !r.text.includes("Viral fever"), r.status);
  r = await call("POST", "/api/portal/login", { jar: P, body: { phone: "9830012345", pin: "482913" } });
  check("The patient signs in again with phone and PIN", r.status === 200 && P.clinicos_patient, r.status);
  await call("POST", "/api/portal/logout", { jar: P });
  for (let i = 0; i < 5; i++) await call("POST", "/api/portal/login", { body: { phone: "9830012345", pin: "000000" } });
  r = await call("POST", "/api/portal/login", { jar: P, body: { phone: "9830012345", pin: "482913" } });
  check("Five wrong PINs lock the account, even to the right one", r.status === 429, r.status);
  r = await call("POST", "/api/portal/start", { jar: P, body: { phone: "9830012345", code: code1, pin: "777888" } });
  check("A printed code sets a new PIN and lifts the lock", r.status === 200 && P.clinicos_patient, JSON.stringify(r.json));

  // ------------------------------------------------ more visits, a new code, stopping
  r = await call("POST", "/api/consults", { jar: D, body: { patientId } });
  const v2 = r.json.consult.id;
  await call("POST", `/api/consults/${v2}/sign`, { jar: D, body: { note: note({ chiefComplaint: "Follow-up", diagnosis: "Recovered" }) } });
  r = await call("POST", `/api/consults/${v2}/share`, { jar: D, body: { consent: true } });
  const code2 = r.json?.code;
  r = await call("GET", "/p", { jar: P });
  check("A later visit shared to the same phone appears by itself", r.text.includes("Recovered") && r.text.includes("Viral fever"), r.status);

  r = await call("POST", `/api/consults/${v2}/share`, { jar: D, body: { consent: true } });
  const code2b = r.json?.code;
  check("Sharing again gives a new code", r.status === 200 && code2b && code2b !== code2 && r.json.renewed === true, JSON.stringify(r.json));
  r = await call("POST", "/api/portal/start", { body: { phone: "9830012345", code: code2, pin: "111222" } });
  check("…and the old code stops working", r.status === 401, r.status);

  r = await call("DELETE", `/api/consults/${v1}/share`, { jar: D });
  check("The doctor stops sharing the first visit", r.status === 200 && r.json.ok, JSON.stringify(r.json));
  r = await call("GET", `/p/visits/${shareId}`, { jar: P });
  check("It is gone for the patient, even by its direct address", r.status === 404, r.status);
  r = await call("GET", "/p", { jar: P });
  check("…and from their list", !r.text.includes("Viral fever") && r.text.includes("Recovered"), r.status);
  r = await call("POST", "/api/portal/start", { body: { phone: "9830012345", code: code1, pin: "111222" } });
  check("…and its code no longer opens anything", r.status === 401, r.status);

  // ------------------------------------------------ another clinic's doctor
  r = await call("POST", "/api/auth/login", { body: { clinic: "sharma", username: "doctor", password: "sharma-pass-1" } });
  const other = {};
  await call("POST", "/api/auth/login", { jar: other, body: { clinic: "sharma", username: "doctor", password: "sharma-pass-1" } });
  r = await call("POST", `/api/consults/${v2}/share`, { jar: other, body: { consent: true } });
  const r2 = await call("DELETE", `/api/consults/${v2}/share`, { jar: other });
  check("Another clinic's doctor can neither share nor stop sharing this clinic's visit", r.status === 404 && r2.status === 404, `${r.status} ${r2.status}`);

  // ------------------------------------------------ the patient's own choices
  const s2 = await db(async (d) => (await d.get(`SELECT id FROM "PortalShare" WHERE "consultId" = ?`, v2)).id);
  r = await call("POST", `/api/portal/visits/${s2}/hide`, { jar: P });
  const listAfterHide = await call("GET", "/p", { jar: P });
  check("The patient can take a visit out of their list", r.status === 200 && !listAfterHide.text.includes("Recovered"), r.status);
  r = await call("POST", "/api/portal/start", { jar: P, body: { phone: "9830012345", code: code2b, pin: "999000" } });
  const listAfterCode = await call("GET", "/p", { jar: P });
  check("…and its code brings it back", r.status === 200 && listAfterCode.text.includes("Recovered"), r.status);
  r = await call("POST", "/api/portal/account/delete", { jar: P, body: { confirm: "delete me" } });
  check("Deleting the account needs DELETE typed", r.status === 400, r.status);
  r = await call("POST", "/api/portal/account/delete", { jar: P, body: { confirm: "DELETE" } });
  const afterDelete = await call("POST", "/api/portal/login", { body: { phone: "9830012345", pin: "999000" } });
  check("The patient deletes their account, and its PIN no longer works", r.status === 200 && afterDelete.status === 401, `${r.status} ${afterDelete.status}`);
  await db(async (d) => {
    const n = (await d.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "PortalShare" WHERE "patientId" = ?`, patientId)).n;
    check("…while the clinic's own record of what it shared stays", n === 2, n);
  });

  // ------------------------------------------------ guessing, and erasure
  for (let i = 0; i < 10; i++) await call("POST", "/api/portal/start", { body: { phone: "9000099999", code: "AAAA-BBBB-CC", pin: "123456" } });
  r = await call("POST", "/api/portal/start", { body: { phone: "9000099999", code: "AAAA-BBBB-CC", pin: "123456" } });
  check("Ten wrong tries for one phone number stop further tries for a while", r.status === 429, r.status);
  r = await call("DELETE", `/api/patients/${patientId}`, { jar: D, body: { confirmName: "Mina Portalcheck" } });
  await db(async (d) => {
    const n = (await d.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "PortalShare" WHERE "patientId" = ?`, patientId)).n;
    check("Deleting the patient deletes what was shared of them", r.status === 200 && n === 0, `${r.status} ${n}`);
  });

  done();
})().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
