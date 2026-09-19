// Prescription extras: the clinic's logo (#25), "come back at once if…" in the
// doctor's own words (#20), and the medicine timing card (#9). Run by run.mjs
// after workflow-test.cjs, whose accounts it signs in with:
//   node scripts/test/rx-test.cjs <test.db>
const { peek } = require("./peek.cjs");

const BASE = process.env.TEST_BASE || "http://localhost:3000";
const [dbPath] = process.argv.slice(2);
const results = [];
const check = (name, ok, info = "") => results.push({ ok: !!ok, name, info: String(info) });

async function call(method, p, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.cookie = `clinicos_session=${token}`;
  let payload = form;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + p, { method, headers, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.match(/^clinicos_session=([^;]*)/)).filter((m) => m && m[1]).map((m) => m[1]).at(-1);
  return { status: res.status, json, text, token: cookie || null };
}
const note = (over = {}) => ({
  chiefComplaint: "", history: "", examination: "", diagnosis: "", medications: [], investigations: [], advice: "", followUp: "", returnIf: "", ...over,
});
const logoForm = (bytes, name = "logo.png") => {
  const f = new FormData();
  f.append("logo", new Blob([bytes]), name);
  return f;
};
// A real 1 × 1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

(async () => {
  const login = async (username, password) => (await call("POST", "/api/auth/login", { body: { username, password } })).token;
  const owner = await login("owner", "owner-pass-1");
  const mgr = await login("manager", "manager-pass-123");
  check("Accounts from the earlier runs sign in", owner && mgr);

  // ------------------------------------------------ the logo (#25)
  let r = await call("POST", "/api/admin/prescription/logo", { token: mgr, form: logoForm(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "logo.png") });
  check("An SVG is refused as a logo, whatever its name says", r.status === 400, JSON.stringify(r.json));
  r = await call("POST", "/api/admin/prescription/logo", { token: mgr, form: logoForm(Buffer.concat([PNG, Buffer.alloc(120 * 1024)])) });
  check("A logo over 100 KB is refused", r.status === 400, JSON.stringify(r.json));
  r = await call("POST", "/api/admin/prescription/logo", { token: mgr, form: logoForm(PNG) });
  check("A PNG logo is saved", r.status === 200, JSON.stringify(r.json));

  // ------------------------------------------------ the timing card (#9)
  r = await call("POST", "/api/admin/prescription", { token: mgr, body: { cardLanguage: "fr" } });
  check("An unknown card language is refused", r.status === 400, r.status);
  r = await call("POST", "/api/admin/prescription", { token: mgr, body: { cardLanguage: "bn" } });
  check("The timing card is switched on, in Bengali", r.status === 200, r.status);

  // ------------------------------------------------ a prescription with all three
  r = await call("POST", "/api/patients", { token: owner, body: { name: "Rx Extras Patient", age: "45" } });
  const cid = r.json?.consultId;
  const meds = [
    { name: "Amoxicillin", dose: "500mg", frequency: "1-0-1", duration: "5 days", instructions: "After food" },
    { name: "Pantoprazole", dose: "40mg", frequency: "OD", duration: "2 weeks", instructions: "Empty stomach" },
    { name: "Cetirizine", dose: "10mg", frequency: "HS", duration: "", instructions: "" },
    { name: "Syrup Mystery", dose: "", frequency: "as told", duration: "", instructions: "" },
  ];
  const warning = "Fever above 102°F, or any trouble breathing";
  r = await call("POST", `/api/consults/${cid}/sign`, { token: owner, body: { note: note({ chiefComplaint: "Cough", medications: meds, returnIf: warning }) } });
  check("A note with warning signs is signed", r.status === 200, JSON.stringify(r.json));
  r = await call("GET", `/consult/${cid}`, { token: owner });
  const page = r.text;
  check("The prescription carries the clinic's logo", page.includes("data:image/png;base64,iVBORw0KGgo"), r.status);
  check("…the doctor's warning signs, in a box, headed in the card's language too", page.includes(warning) && page.includes("Come back at once if") && page.includes("অবিলম্বে আসুন যদি"), r.status);
  check("…and the timing card in Bengali", page.includes("কখন ওষুধ খাবেন") && page.includes("সকাল") && page.includes("রাত"), r.status);
  check("1-0-1 after food for 5 days reads as morning and night, after food, ৫ দিন", page.includes("খাবার পরে") && page.includes("৫ দিন"), r.status);
  check("OD gets no time of day, only “once a day”, and empty stomach reads as such", page.includes("দিনে একবার") && page.includes("খালি পেটে") && page.includes("২ সপ্তাহ"), r.status);
  check("Anything the card cannot read for certain is printed as the doctor wrote it", page.includes("as told"), r.status);
  {
    const db = peek(dbPath);
    const f = JSON.parse((await db.get(`SELECT "finalJson" FROM "Consult" WHERE id = ?`, cid)).finalJson);
    check("The warning signs are stored with the signed note", f.returnIf === warning, f.returnIf);
    await db.close();
  }

  // Warning signs never count as a correction to the AI's draft.
  r = await call("POST", "/api/consults", { token: owner, body: { patientId: (await call("GET", "/api/patients?q=Rx Extras", { token: owner })).json.patients[0].id } });
  const drafted = r.json.consult.id;
  {
    const db = peek(dbPath);
    await db.run(`UPDATE "Consult" SET "draftJson" = ?, transcript = 'x' WHERE id = ?`, JSON.stringify(note({ chiefComplaint: "Cough", diagnosis: "URI" })), drafted);
    await db.close();
  }
  r = await call("POST", `/api/consults/${drafted}/sign`, { token: owner, body: { note: note({ chiefComplaint: "Cough", diagnosis: "URI", returnIf: "Blood in sputum" }) } });
  check("Adding warning signs to an AI draft is not counted as a correction", r.status === 200 && r.json.editCount === 0, JSON.stringify(r.json));

  r = await call("POST", "/api/favourites", { token: owner, body: { name: "Chest infection", plan: note({ diagnosis: "LRTI", returnIf: "Breathlessness" }) } });
  check("A favourite keeps the doctor's warning signs with the plan", r.status === 200 && r.json.favourite.plan.returnIf === "Breathlessness", JSON.stringify(r.json));

  // ------------------------------------------------ switching both off
  await call("DELETE", "/api/admin/prescription/logo", { token: mgr });
  await call("POST", "/api/admin/prescription", { token: mgr, body: { cardLanguage: "off" } });
  r = await call("GET", `/consult/${cid}`, { token: owner });
  check("With the logo removed and the card off, neither prints", !r.text.includes("data:image/png") && !r.text.includes("কখন ওষুধ খাবেন"), r.status);
  check("…while the warning signs, which are part of the note, still do", r.text.includes(warning), r.status);

  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  [${x.info}]`}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
