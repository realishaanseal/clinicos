// Billing (#12), follow-up recall (#10), what the follow-up list is worth (#11)
// and the day in one message (#13). Run by run.mjs after rx-test.cjs,
// whose accounts it signs in with:
//   node scripts/test/billing-test.cjs <test.db>
const { peek, ONLINE } = require("./peek.cjs");

const BASE = process.env.TEST_BASE || "http://localhost:3000";
const BASE_PATH = new URL(BASE).pathname.replace(/\/$/, "");
const [dbPath] = process.argv.slice(2);
const results = [];
const check = (name, ok, info = "") => results.push({ ok: !!ok, name, info: String(info) });

async function call(method, p, { token, body } = {}) {
  const headers = {};
  if (token) headers.cookie = `clinicos_session=${token}`;
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + (p === "/" && BASE_PATH ? "" : p), { method, headers, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.match(/^clinicos_session=([^;]*)/)).filter((m) => m && m[1]).map((m) => m[1]).at(-1);
  return { status: res.status, json, text, token: cookie || null, location: res.headers.get("location") };
}
const goesTo = (r, target) =>
  (r.status >= 300 && r.status < 400 && r.location && new URL(r.location, BASE).pathname === BASE_PATH + target) ||
  r.text.includes(`NEXT_REDIRECT;replace;${target};`) ||
  r.text.includes(`NEXT_REDIRECT;push;${target};`);

// The clinic's calendar, the way the app counts it: its own zone online, this
// computer's otherwise (the test runs on the same computer as the app).
const TZ = process.env.NEXT_PUBLIC_CLINIC_TIMEZONE || undefined;
function clinicDay(offsetDays = 0) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offsetDays));
  return d.toISOString().slice(0, 10);
}

const note = (over = {}) => ({
  chiefComplaint: "", history: "", examination: "", diagnosis: "", medications: [], investigations: [], advice: "", followUp: "", returnIf: "", followUpOn: "", ...over,
});
const SECRET = "Secretdiagnosis";
// Next escapes & inside attributes; the link's own query uses one.
const hrefs = (html) => [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

(async () => {
  const login = async (username, password) => (await call("POST", "/api/auth/login", { body: { username, password } })).token;
  const owner = await login("owner", "owner-pass-1");
  const desk = await login("desk", "desk-pass-123");
  const mgr = await login("manager", "manager-pass-123");
  const doc3 = await login("doc3", "doc3-pass-123");
  check("Accounts from the earlier runs sign in", owner && desk && mgr && doc3);

  // ------------------------------------------------ 1. the consultation fee
  let r = await call("POST", "/api/admin/billing", { token: desk, body: { fee: "1" } });
  check("The front desk cannot set the fee", r.status === 403, r.status);
  r = await call("POST", "/api/admin/billing", { token: mgr, body: { fee: "three hundred" } });
  check("A fee that is not an amount is refused", r.status === 400, r.status);
  r = await call("POST", "/api/admin/billing", { token: mgr, body: { fee: "₹ 300" } });
  check("Clinic admin sets the consultation fee", r.status === 200, JSON.stringify(r.json));

  // A patient with a signed visit, so we can check nothing clinical reaches a bill.
  r = await call("POST", "/api/patients", { token: owner, body: { name: "Bill Patient One", age: "41", phone: "9830011111" } });
  const p1 = r.json?.patient?.id;
  await call("POST", `/api/consults/${r.json?.consultId}/sign`, { token: owner, body: { note: note({ chiefComplaint: "Cough", diagnosis: `${SECRET} bronchitis` }) } });
  r = await call("POST", "/api/patients", { token: desk, body: { name: "Bill Patient Two", queue: true } });
  const p2 = r.json?.patient?.id;

  r = await call("GET", `/bills?patient=${p1}`, { token: desk });
  check("The bills page opens on a patient, starting from the clinic's fee", r.status === 200 && r.text.includes("Bill Patient One") && r.text.includes('value="Consultation"') && r.text.includes('value="300"'), r.status);

  // ------------------------------------------------ 2. making and paying bills
  const bill = (token, patientId, items, pay) => call("POST", "/api/bills", { token, body: { patientId, items, pay } });
  r = await bill(desk, p1, [{ label: "Consultation", amount: 30000 }, { label: "Dressing", amount: 15050 }], "cash");
  const b1 = r.json?.bill;
  check("The front desk makes a bill and takes cash for it at once", r.status === 200 && b1?.paidAt && b1.totalPaise === 45050 && b1.method === "cash", JSON.stringify(r.json));
  const numbered = ONLINE ? /^\d{4}$/ : /^[B-DF-HJKMNP-TV-XZ]{3}-\d{4}$/;
  check(ONLINE ? "Online receipt numbers are plain: 0001" : "A clinic computer's receipt numbers carry its own tag: XYZ-0001", numbered.test(b1?.receiptNo ?? "") && b1.receiptNo.endsWith("0001"), b1?.receiptNo);
  const prefix = (b1?.receiptNo ?? "").replace(/\d{4}$/, "");

  r = await bill(desk, p2, [{ label: "Consultation", amount: 30000 }]);
  const b2 = r.json?.bill;
  check("A bill can wait to be paid, with no receipt number yet", r.status === 200 && !b2?.paidAt && b2?.receiptNo === null, JSON.stringify(r.json));
  r = await bill(doc3, p2, [{ label: "Injection", amount: 20000 }], "upi");
  const b3 = r.json?.bill;
  check("A doctor can take payment too, and the number follows on", r.status === 200 && b3?.receiptNo === `${prefix}0002`, JSON.stringify(r.json));
  r = await call("POST", `/api/bills/${b2.id}/pay`, { token: desk, body: { method: "card" } });
  check("Paying the waiting bill later gives it the next number, not the one it was made with", r.status === 200 && r.json?.bill?.receiptNo === `${prefix}0003` && r.json.bill.method === "card", JSON.stringify(r.json));
  r = await call("POST", `/api/bills/${b2.id}/pay`, { token: desk, body: { method: "cash" } });
  check("A bill cannot be paid twice", r.status === 409 && /already paid/.test(r.json?.error || ""), JSON.stringify(r.json));
  r = await call("POST", `/api/bills/${b2.id}/pay`, { token: desk, body: { method: "bitcoin" } });
  check("…and a payment needs a method the clinic knows", r.status === 400, r.status);

  r = await call("GET", "/api/bills/patients?q=Bill Patient", { token: mgr });
  check("A clinic admin, who has no front-desk screens, can still find a patient to bill", r.status === 200 && r.json.patients.length >= 2 && !JSON.stringify(r.json).includes("consultCount"), JSON.stringify(r.json));
  r = await call("GET", "/api/patients?q=Bill Patient", { token: mgr });
  check("…while the front desk's own search stays closed to them", r.status === 403, r.status);
  r = await bill(mgr, p1, [{ label: "Certificate", amount: 10000 }], "cash");
  const b6 = r.json?.bill;
  check("A clinic admin takes a payment", r.status === 200 && b6?.receiptNo === `${prefix}0004`, JSON.stringify(r.json));

  const refused = [
    ["no lines", []],
    ["a line with no description", [{ label: "", amount: 100 }]],
    ["a negative amount", [{ label: "Refund?", amount: -100 }]],
    ["a fraction of a paisa", [{ label: "Consultation", amount: 100.5 }]],
    ["an amount typed as words", [{ label: "Consultation", amount: "three hundred" }]],
    ["a bill of ₹0", [{ label: "Consultation", amount: 0 }]],
  ];
  const wrong = [];
  for (const [what, items] of refused) {
    const x = await bill(desk, p1, items);
    if (x.status !== 400) wrong.push(`${what}=${x.status}`);
  }
  check(`Bills that make no sense are refused (${refused.length} kinds)`, wrong.length === 0, wrong.join("; "));
  r = await bill(desk, "no-such-patient", [{ label: "Consultation", amount: 100 }]);
  check("…and so is a bill for nobody on file", r.status === 404, r.status);

  // ------------------------------------------------ 3. cancelling
  r = await bill(desk, p2, [{ label: "Follow-up visit", amount: 12000 }]);
  const b4 = r.json?.bill;
  r = await call("POST", `/api/bills/${b3.id}/cancel`, { token: desk, body: { reason: "x", confirm: "CANCEL" } });
  check("The front desk cannot cancel a bill", r.status === 403, r.status);
  r = await call("POST", `/api/bills/${b3.id}/cancel`, { token: mgr, body: { reason: "Charged twice", confirm: "cancel" } });
  check("Cancelling needs CANCEL typed exactly", r.status === 400, r.status);
  r = await call("POST", `/api/bills/${b3.id}/cancel`, { token: mgr, body: { reason: " ", confirm: "CANCEL" } });
  check("…and a reason", r.status === 400, r.status);
  r = await call("POST", `/api/bills/${b3.id}/cancel`, { token: mgr, body: { reason: "Bill Patient Two was charged twice", confirm: "CANCEL" } });
  check("Clinic admin cancels a paid bill, which stays on record marked cancelled", r.status === 200 && r.json?.bill?.voidedAt && r.json.bill.receiptNo === `${prefix}0002`, JSON.stringify(r.json));
  r = await call("POST", `/api/bills/${b3.id}/cancel`, { token: mgr, body: { reason: "again", confirm: "CANCEL" } });
  check("A bill is cancelled only once", r.status === 409, r.status);
  await call("POST", `/api/bills/${b4.id}/cancel`, { token: owner, body: { reason: "Not needed", confirm: "CANCEL" } });
  r = await call("POST", `/api/bills/${b4.id}/pay`, { token: desk, body: { method: "cash" } });
  check("A cancelled bill cannot be paid", r.status === 409, r.status);
  r = await bill(doc3, p1, [{ label: "Consultation", amount: 50000 }]);
  const b5 = r.json?.bill;

  // ------------------------------------------------ 4. what the desk sees
  r = await call("GET", "/api/bills", { token: desk });
  const t = r.json?.takings;
  check(
    "Collected today counts cash, UPI and card separately, leaving out cancelled bills",
    r.status === 200 && t?.total === 45050 + 30000 + 10000 && t.byMethod.cash === 55050 && t.byMethod.card === 30000 && !t.byMethod.upi && t.count === 3,
    JSON.stringify(t)
  );
  check("Still owed is the one bill waiting", r.json?.owed?.total === 50000 && r.json.owed.count === 1 && r.json.unpaid.length === 1 && r.json.unpaid[0].id === b5.id, JSON.stringify(r.json?.owed));
  const numbers = r.json.paidToday.map((b) => b.receiptNo).sort();
  check("Receipt numbers run in the order money was taken, with no gaps", JSON.stringify(numbers) === JSON.stringify([1, 2, 3, 4].map((n) => `${prefix}000${n}`)), numbers.join(","));
  check("Nothing clinical reaches the bills desk", !r.text.includes(SECRET), "diagnosis found");
  r = await call("GET", "/bills", { token: desk });
  check("The bills page shows the takings, and nothing clinical", r.status === 200 && r.text.includes("₹850.50") && r.text.includes("Collected today") && !r.text.includes(SECRET), r.status);

  // Several desks paying at once must never share a number.
  const racers = [];
  for (let i = 0; i < 6; i++) racers.push((await bill(desk, p2, [{ label: `Item ${i}`, amount: 100 + i }])).json.bill.id);
  const paid = await Promise.all(racers.map((id) => call("POST", `/api/bills/${id}/pay`, { token: desk, body: { method: "cash" } })));
  const got = paid.map((x) => x.json?.bill?.receiptNo);
  check("Six payments at once get six different numbers", paid.every((x) => x.status === 200) && new Set(got).size === 6, got.join(","));

  // ------------------------------------------------ 5. the receipt
  r = await call("GET", `/bills/${b1.id}`, { token: desk });
  check(
    "The receipt shows the clinic, number, patient, lines, total and method",
    r.status === 200 && r.text.includes(b1.receiptNo) && r.text.includes("Bill Patient One") && r.text.includes("Dressing") && r.text.includes("₹450.50") && r.text.includes("Cash") && r.text.includes("Test Clinic Renamed"),
    r.status
  );
  check("…and nothing clinical", !r.text.includes(SECRET) && !r.text.includes("bronchitis"), "diagnosis on the receipt");
  r = await call("GET", `/bills/${b3.id}`, { token: desk });
  check("A cancelled receipt says so", r.status === 200 && r.text.includes("Cancelled") && r.text.includes("charged twice"), r.status);
  r = await call("GET", `/bills/no-such-bill`, { token: desk });
  check("An unknown bill is not found", r.status === 404, r.status);

  // ------------------------------------------------ 6. the log and the export
  {
    const db = peek(dbPath);
    const actions = (await db.all(`SELECT action, detail FROM "AuditEvent" WHERE action LIKE 'bill_%'`));
    check("Making, paying and cancelling are in the activity log", ["bill_create", "bill_pay", "bill_void"].every((a) => actions.some((x) => x.action === a)), actions.map((a) => a.action).join(","));
    check("…with amounts and receipt numbers, and no patient's name — not even one typed into a reason", actions.every((a) => !/Bill Patient/.test(a.detail || "")) && actions.some((a) => a.detail?.includes(b1.receiptNo)), JSON.stringify(actions.slice(0, 3)));
    const tag = await db.get(`SELECT value FROM "ClinicSetting" WHERE key = 'receipt_tag'`);
    check(ONLINE ? "Online there is no receipt tag" : "The clinic computer keeps its tag in a setting that never travels", ONLINE ? !tag : tag?.value === prefix.replace(/-$/, ""), tag?.value);
    await db.close();
  }
  r = await call("GET", "/api/backup/export", { token: mgr });
  const exported = r.json?.patients?.find((p) => p.id === p1);
  check("The full export carries each patient's bills with their lines", r.status === 200 && exported?.bills?.some((b) => b.receiptNo === b1.receiptNo && b.items[1].label === "Dressing"), JSON.stringify(exported?.bills?.[0]));

  // ------------------------------------------------ 7. follow-up dates on the note
  const today = clinicDay(0);
  const visit = async (name, phone, followUpOn, over = {}) => {
    const reg = await call("POST", "/api/patients", { token: owner, body: { name, age: "50", phone } });
    const s = await call("POST", `/api/consults/${reg.json.consultId}/sign`, {
      token: owner,
      body: { note: note({ chiefComplaint: "Knee pain", diagnosis: `${SECRET} arthritis`, followUp: "Review", followUpOn, ...over }) },
    });
    return { patient: reg.json.patient.id, consult: reg.json.consultId, signed: s.status };
  };
  const dueToday = await visit("Recall Today", "98300 12345", today);
  const overdue = await visit("Recall Overdue", "+91 98300-22222", clinicDay(-3));
  const future = await visit("Recall Future", "9830033333", clinicDay(5));
  const tooOld = await visit("Recall Ancient", "9830044444", clinicDay(-70));
  const cameBack = await visit("Recall Cameback", "9830055555", clinicDay(-1));
  const queued = await visit("Recall Queued", "9830066666", today);
  const noPhone = await visit("Recall Nophone", "", today);
  const badDate = await visit("Recall Baddate", "9830077777", "2026-02-31");
  check("Visits with a date to come back are signed", [dueToday, overdue, future, tooOld, cameBack, queued, noPhone, badDate].every((v) => v.signed === 200));
  {
    const db = peek(dbPath);
    const c = await db.get(`SELECT "followUpOn", "finalJson" FROM "Consult" WHERE id = ?`, dueToday.consult);
    check("Signing keeps the date with the note and in its own column", c.followUpOn === today && JSON.parse(c.finalJson).followUpOn === today, JSON.stringify(c.followUpOn));
    const bad = await db.get(`SELECT "followUpOn" FROM "Consult" WHERE id = ?`, badDate.consult);
    check("A date that does not exist (31 February) is not kept", bad.followUpOn === null, bad.followUpOn);
    await db.close();
  }
  await call("POST", "/api/consults", { token: owner, body: { patientId: cameBack.patient } });
  await call("POST", "/api/queue", { token: desk, body: { patientId: queued.patient } });

  r = await call("GET", `/consult/${dueToday.consult}`, { token: owner });
  check("The prescription prints the date to come back", r.status === 200 && r.text.includes("Come back on"), r.status);

  // A date the AI put in its draft is never the date: only the doctor's is.
  r = await call("POST", "/api/patients", { token: owner, body: { name: "Recall Drafted", phone: "9830088888" } });
  const drafted = r.json.consultId;
  {
    const db = peek(dbPath);
    await db.run(`UPDATE "Consult" SET "draftJson" = ?, transcript = 'x' WHERE id = ?`, JSON.stringify(note({ chiefComplaint: "Fever", followUpOn: clinicDay(1) })), drafted);
    await db.close();
  }
  r = await call("POST", `/api/consults/${drafted}/sign`, { token: owner, body: { note: note({ chiefComplaint: "Fever", followUpOn: clinicDay(2) }) } });
  check("Setting the date on an AI-drafted note is not counted as a correction", r.status === 200 && r.json.editCount === 0, JSON.stringify(r.json));

  // ------------------------------------------------ 8. the follow-up list
  r = await call("GET", "/api/followups", { token: desk });
  const names = (r.json?.due ?? []).map((d) => d.patientName);
  check("Due today and overdue are on the list", r.status === 200 && names.includes("Recall Today") && names.includes("Recall Overdue") && names.includes("Recall Nophone"), names.join(","));
  check("…not a date still to come, nor one more than 60 days gone", !names.includes("Recall Future") && !names.includes("Recall Ancient"), names.join(","));
  check("…nor a patient who has been back since, or is on today's list", !names.includes("Recall Cameback") && !names.includes("Recall Queued"), names.join(","));
  check("…oldest first, and never why they were seen", names.indexOf("Recall Overdue") < names.indexOf("Recall Today") && !r.text.includes(SECRET) && !r.text.includes("arthritis"), r.text.slice(0, 200));
  r = await call("GET", "/api/followups", { token: mgr });
  check("A non-clinical clinic admin does not get the follow-up list (it is the desk's)", r.status === 403, r.status);

  await call("POST", "/api/admin/billing", { token: mgr, body: { recallMessage: "Hi {name}, {doctor} at {clinic} wants to see you on {date}. {diagnosis}" } });
  r = await call("GET", "/followups", { token: desk });
  const links = hrefs(r.text);
  const todayLink = links.find((h) => h.startsWith("https://wa.me/919830012345?"));
  const text = todayLink ? decodeURIComponent(todayLink.split("text=")[1]) : "";
  check("Message on WhatsApp opens a chat with the patient's number, with India's code", r.status === 200 && !!todayLink, links.join(" "));
  check("A number written with +91 and dashes reaches the same kind of link", links.some((h) => h.startsWith("https://wa.me/919830022222?")), links.join(" "));
  check("A patient with no number gets no link", !links.some((h) => /wa\.me\/(\?|91\?)/.test(h)) && r.text.includes("No phone number on file"), links.length);
  check("The message names the patient, doctor, clinic and date from the clinic's template", text.startsWith("Hi Recall Today, Dr Owner at Test Clinic Renamed wants to see you on"), text);
  check("…and can never carry a diagnosis: an unknown placeholder stays as typed", text.includes("{diagnosis}") && !text.includes(SECRET) && !r.text.includes(SECRET), text);
  await call("POST", "/api/admin/billing", { token: mgr, body: { recallMessage: "" } });

  r = await call("GET", "/", { token: desk });
  check("The front desk's Today says follow-ups are due, and what was collected", r.status === 200 && r.text.includes("due a follow-up") && r.text.includes("Collected today") && r.text.includes("/bills?patient="), r.status);

  r = await call("POST", `/api/followups/${dueToday.consult}`, { token: desk, body: { action: "messaged" } });
  check("Messaging a patient takes them off the list", r.status === 200, JSON.stringify(r.json));
  r = await call("POST", `/api/followups/${overdue.consult}`, { token: desk, body: { action: "dismissed" } });
  check("…and so does marking it not needed", r.status === 200, JSON.stringify(r.json));
  r = await call("POST", `/api/followups/${overdue.consult}`, { token: desk, body: { action: "messaged" } });
  check("Acting on it again changes the one record rather than adding another", r.status === 200, JSON.stringify(r.json));
  r = await call("POST", `/api/followups/${noPhone.consult}`, { token: desk, body: { action: "forgot" } });
  check("An action the desk cannot take is refused", r.status === 400, r.status);
  r = await call("POST", `/api/followups/no-such-visit`, { token: desk, body: { action: "messaged" } });
  check("…and so is a visit that is not on file", r.status === 404, r.status);
  r = await call("GET", "/api/followups", { token: desk });
  const left = (r.json?.due ?? []).map((d) => d.patientName);
  check("What is left is only what nobody has dealt with", !left.includes("Recall Today") && !left.includes("Recall Overdue") && left.includes("Recall Nophone"), left.join(","));
  {
    const db = peek(dbPath);
    const rows = await db.all(`SELECT action FROM "Recall" WHERE "consultId" = ?`, overdue.consult);
    check("One visit, one recall record", rows.length === 1 && rows[0].action === "messaged", JSON.stringify(rows));
    await db.close();
  }
  r = await call("GET", "/followups", { token: mgr });
  check("The Follow-ups page sends a non-clinical admin home", goesTo(r, "/admin"), `${r.status} ${r.location}`);

  // ------------------------------------------------ 9. what the list is worth (#11)
  r = await call("GET", "/followups", { token: desk });
  const left2 = (await call("GET", "/api/followups", { token: desk })).json.due.length;
  check(
    "The follow-up list says what it is worth at the clinic's own fee, and how that is worked out",
    r.status === 200 && r.text.includes("Fees if they come") && r.text.includes(`${left2} × ₹300`),
    r.status
  );

  // ------------------------------------------------ 10. the day in one message (#13)
  r = await call("POST", "/api/admin/billing", { token: mgr, body: { ownerPhone: "12" } });
  check("A day-end number WhatsApp could not open is refused", r.status === 400, JSON.stringify(r.json));
  r = await call("POST", "/api/admin/billing", { token: desk, body: { ownerPhone: "98300 77777" } });
  check("The front desk cannot change where the summary goes", r.status === 403, r.status);
  r = await call("POST", "/api/admin/billing", { token: mgr, body: { ownerPhone: "98300 77777" } });
  check("Clinic admin sets where the day's summary goes", r.status === 200, JSON.stringify(r.json));

  r = await call("GET", "/", { token: desk });
  const summary = /class="day-summary">([\s\S]*?)<\/pre>/.exec(r.text)?.[1] || "";
  const decoded = summary.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  check(
    "The front desk's Today carries the day in one message: seen, collected, owed, tomorrow's follow-ups",
    r.status === 200 && /Patients seen: \d/.test(decoded) && /Collected: ₹/.test(decoded) && /Still owed: ₹/.test(decoded) && /Follow-ups due tomorrow: \d/.test(decoded),
    decoded.slice(0, 200)
  );
  check("…naming no patient and nothing clinical", !!decoded && !decoded.includes("Bill Patient") && !decoded.includes("Recall") && !decoded.includes(SECRET), decoded.slice(0, 200));
  check("…and a WhatsApp link to the number the clinic set", hrefs(r.text).some((h) => h.startsWith("https://wa.me/919830077777?")), hrefs(r.text).join(" "));
  const doctorToday = await call("GET", "/", { token: owner });
  check("The doctor's Today has the same summary", doctorToday.status === 200 && doctorToday.text.includes("The day in one message"), doctorToday.status);

  r = await call("POST", "/api/admin/billing", { token: mgr, body: { ownerPhone: "" } });
  const noNumber = await call("GET", "/", { token: desk });
  check("With no number set, WhatsApp is asked which chat instead", r.status === 200 && hrefs(noNumber.text).some((h) => h.startsWith("https://wa.me/?text=")), r.status);

  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  [${x.info}]`}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
