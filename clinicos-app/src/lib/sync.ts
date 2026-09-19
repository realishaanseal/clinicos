/**
 * Keeping a clinic computer and its clinic online in step: what travels, and
 * how a change from the other copy is merged into this one.
 *
 * The same code runs on both sides. Online it merges what a clinic computer
 * sends; on the clinic computer it merges what it fetched. Either way it runs
 * inside one transaction per batch, writes only the one clinic's rows, and
 * never trusts the other side with anything but that clinic's own records.
 *
 * What never travels:
 *   - recordings. They stay where they were made until the doctor signs, and
 *     are deleted there (the consent script's promise). A visit signed on the
 *     other copy deletes this copy's recording of it when the signature arrives.
 *   - sessions, sign-in attempts, and this computer's own sync bookkeeping
 *   - the clinic's plan, which Varaxis sets online
 *
 * How two versions of one row are merged:
 *   - a signed visit is the record, and stands: nothing unsigned replaces it,
 *     and a second signature elsewhere does not replace the first
 *   - the AI's draft of a note (draftJson) is never replaced once written, so
 *     the correction count at signing stays honest (CLAUDE.md, invariant 6)
 *   - otherwise the most recent change wins, row by row
 *   - a deletion wins over everything: a deleted patient stays deleted, and
 *     anything that arrives for them later is dropped with them
 *   - edits and the activity log are only ever added to
 *   - a payment or a cancellation on a bill, once recorded anywhere, stands:
 *     the receipt number was printed and handed to someone
 *
 * Server only.
 */
import { BACKEND, isUniqueViolation, q, savepoint, tx, type Param } from "./sql";
import type { ClinicId } from "./db";

export const SYNC_TABLES = [
  "ClinicSetting", "User", "Patient", "Consult", "PortalShare", "Edit", "QueueEntry", "Bill", "Recall", "Favourite",
  "AuditEvent",
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export function isSyncTable(t: unknown): t is SyncTable {
  return typeof t === "string" && (SYNC_TABLES as readonly string[]).includes(t);
}

/** The columns that travel. Never clinicId (each side writes its own), never
 *  the bookkeeping columns, never a recording's location. A column added to one
 *  of these tables must be added here too, or it will not reach the other copy. */
export const COLUMNS: Record<SyncTable, string[]> = {
  ClinicSetting: ["key", "value", "updatedAt"],
  User: [
    "id", "name", "username", "role", "isAdmin", "passwordHash", "qualification", "regNo", "active",
    "mustChangePassword", "createdAt", "lastLoginAt", "updatedAt",
  ],
  Patient: ["id", "name", "age", "sex", "phone", "guardianName", "createdAt", "updatedAt"],
  Consult: [
    "id", "patientId", "consentGiven", "consentAt", "consentBy", "audioBytes", "audioSeconds", "audioDeletedAt",
    "transcript", "asrModel", "asrSeconds", "draftJson", "workingJson", "workingSavedAt", "recordingStartedAt",
    "recordingEndedAt", "finalJson", "llmModel", "llmSeconds", "signedAt", "createdBy", "doctorId", "transcribedAt",
    "draftedAt", "followUpOn", "createdAt", "updatedAt",
  ],
  // Only what a clinic computer needs to show that a visit was shared: never the
  // phone's HMAC, the code's hash or the encrypted prescription.
  PortalShare: ["id", "consultId", "patientId", "visitDate", "sharedAt", "sharedBy", "consentBy", "revokedAt", "updatedAt"],
  Edit: ["id", "consultId", "field", "before", "after", "createdAt"],
  QueueEntry: ["id", "patientId", "day", "token", "status", "addedBy", "consultId", "calledBy", "addedAt", "calledAt", "doneAt", "updatedAt"],
  Bill: [
    "id", "patientId", "itemsJson", "totalPaise", "day", "receiptNo", "receiptPrefix", "receiptSeq", "paidAt", "paidDay",
    "method", "receivedBy", "voidedAt", "voidedBy", "voidReason", "createdBy", "createdAt", "updatedAt",
  ],
  Recall: ["id", "consultId", "patientId", "action", "at", "byUser", "updatedAt"],
  Favourite: ["id", "userId", "name", "noteJson", "useCount", "createdAt", "updatedAt"],
  AuditEvent: ["id", "userId", "userName", "action", "targetType", "targetId", "detail", "at"],
};

/** The row's identity. A setting is identified by its name within the clinic. */
export const KEY: Record<SyncTable, string> = {
  ClinicSetting: "key",
  User: "id", Patient: "id", Consult: "id", PortalShare: "id", Edit: "id", QueueEntry: "id", Bill: "id", Recall: "id",
  Favourite: "id", AuditEvent: "id",
};

/** Only added to, never changed: the first copy of a row is the only one. */
const APPEND_ONLY: SyncTable[] = ["Edit", "AuditEvent"];

/** Clinic details that belong to the clinic, as opposed to one computer's own
 *  settings (its sync connection, when it was set up). */
export function isSharedSetting(key: string): boolean {
  return key.startsWith("clinic_") || key.startsWith("rx_");
}

export type Row = Record<string, string | number | null>;
export type Tombstone = { tableName: string; rowId: string; deletedAt: string };
export type Cursor = { at: string; key: string };

const q_ = (c: string) => `"${c}"`;

// ------------------------------------------------------------- reading
/** One changed row and the cursor just after it. row is null for a row this
 *  side reads but does not send (one computer's own settings): the cursor
 *  still moves past it. */
export type Entry<T> = { row: T | null; cursor: Cursor };

function marker(): { mark: string; start: string | number; parse: (at: string) => string | number } {
  return BACKEND === "postgres"
    ? // Every row online is stamped by its trigger, so the index on
      // (clinicId, syncedAt, id) serves this directly.
      { mark: `"syncedAt"`, start: "", parse: (at) => at }
    : { mark: `COALESCE("syncSeq", 0)`, start: 0, parse: (at) => Number(at) || 0 };
}

/**
 * What changed in one table after a cursor, oldest first. Online the cursor is
 * the database's own clock (syncedAt); on the clinic computer it is its change
 * counter (syncSeq), because a clinic's clock may be set wrong. Online, changes
 * that came from the asking computer are left out: it has them already.
 */
export async function readChanges(
  clinicId: ClinicId,
  table: SyncTable,
  after: Cursor | null,
  limit: number,
  exceptOrigin: string | null = null
): Promise<Entry<Row>[]> {
  const key = KEY[table];
  const cols = COLUMNS[table].map(q_).join(", ");
  const { mark, start, parse } = marker();
  const at = after ? parse(after.at) : start;
  const params: Param[] = [clinicId, at, at, after?.key ?? ""];
  let extra = "";
  if (exceptOrigin && BACKEND === "postgres") {
    extra = ` AND ("syncOrigin" IS NULL OR "syncOrigin" <> ?)`;
    params.push(exceptOrigin);
  }
  params.push(limit);
  const rows = await q().all<Row & { _mark: string | number }>(
    `SELECT ${cols}, ${mark} AS "_mark" FROM "${table}"
     WHERE "clinicId" = ? AND (${mark} > ? OR (${mark} = ? AND ${q_(key)} > ?))${extra}
     ORDER BY ${mark}, ${q_(key)} LIMIT ?`,
    ...params
  );
  return rows.map(({ _mark, ...r }) => ({
    row: table === "ClinicSetting" && !isSharedSetting(String(r.key)) ? null : (r as Row),
    cursor: { at: String(_mark), key: String(r[key]) },
  }));
}

export async function readTombstones(
  clinicId: ClinicId,
  after: Cursor | null,
  limit: number,
  exceptOrigin: string | null = null
): Promise<Entry<Tombstone>[]> {
  const { mark: m, start, parse } = marker();
  const at = after ? parse(after.at) : start;
  const params: Param[] = [clinicId, at, at, after?.key ?? ""];
  let extra = "";
  if (exceptOrigin && BACKEND === "postgres") {
    extra = ` AND ("syncOrigin" IS NULL OR "syncOrigin" <> ?)`;
    params.push(exceptOrigin);
  }
  params.push(limit);
  const rows = await q().all<{ id: string; tableName: string; rowId: string; deletedAt: string; _mark: string | number }>(
    `SELECT id, "tableName", "rowId", "deletedAt", ${m} AS "_mark" FROM "SyncTombstone"
     WHERE "clinicId" = ? AND (${m} > ? OR (${m} = ? AND id > ?))${extra}
     ORDER BY ${m}, id LIMIT ?`,
    ...params
  );
  return rows.map((r) => ({
    row: { tableName: r.tableName, rowId: r.rowId, deletedAt: r.deletedAt },
    cursor: { at: String(r._mark), key: r.id },
  }));
}

/** Rows to send, trimmed to a size the other side will accept, and the cursor
 *  to continue from. */
export function page<T>(entries: Entry<T>[], limit: number, maxBytes: number): { rows: T[]; next: Cursor | null; more: boolean } {
  const rows: T[] = [];
  let next: Cursor | null = null;
  let bytes = 0;
  let kept = 0;
  for (const e of entries) {
    const size = e.row ? JSON.stringify(e.row).length : 0;
    if (kept > 0 && bytes + size > maxBytes) break;
    bytes += size;
    kept++;
    if (e.row) rows.push(e.row);
    next = e.cursor;
  }
  return { rows, next, more: kept < entries.length || entries.length === limit };
}

// ------------------------------------------------------------- merging
export type ApplyResult = {
  /** How many of the rows sent were dealt with, from the first. Stops short at
   *  a row whose patient, visit or account has not arrived yet: the sender
   *  keeps it and sends it again once the parent has. */
  accepted: number;
  /** Rows set aside, in plain words, for the clinic to see. */
  conflicts: string[];
  /** Recordings to delete once the batch is saved, because the visit they
   *  belong to was signed on the other copy. */
  audioToRemove: string[];
};

/** Run one batch as one transaction. On the clinic computer the triggers stand
 *  aside while it runs; online, the batch is marked with the computer it came
 *  from so it is not sent straight back. */
export async function inApplyTransaction<T>(origin: string | null, fn: () => Promise<T>): Promise<T> {
  return tx(async () => {
    if (BACKEND === "sqlite") {
      await q().run(`UPDATE "SyncState" SET applying = 1 WHERE id = 1`);
      try {
        return await fn();
      } finally {
        await q().run(`UPDATE "SyncState" SET applying = 0 WHERE id = 1`);
      }
    }
    if (origin) await q().get(`SELECT set_config('clinicos.device', ?, true) AS x`, origin);
    return fn();
  });
}

/** Each row in its own savepoint, so one row the database refuses does not
 *  undo the batch. */
async function guarded<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await savepoint(fn) };
  } catch (error) {
    return { ok: false, error };
  }
}

const now = () => new Date().toISOString();

/** The same shape the delete triggers write: scoped to the clinic, so one
 *  clinic's deletions can never touch another's. */
const tombstoneId = (clinicId: ClinicId, table: string, id: string) => `${clinicId}:${table}:${id}`;

function tombstoned(clinicId: ClinicId, table: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return Promise.resolve(false);
  return q()
    .get(`SELECT 1 AS x FROM "SyncTombstone" WHERE "clinicId" = ? AND id = ?`, clinicId, tombstoneId(clinicId, table, id))
    .then(Boolean);
}

async function exists(clinicId: ClinicId, table: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  return Boolean(await q().get(`SELECT 1 AS x FROM "${table}" WHERE id = ? AND "clinicId" = ?`, id, clinicId));
}

/** Remember that a row is gone, so it is never brought back. Written by hand
 *  for a row dropped with its deleted parent; the triggers write the rest. */
async function addTombstone(clinicId: ClinicId, table: string, id: string) {
  // Online, stamped by the database's own clock and marked with the computer
  // whose change caused it, exactly as the delete trigger would have.
  const cols = BACKEND === "sqlite" ? `, "syncSeq"` : `, "syncedAt", "syncOrigin"`;
  const vals = BACKEND === "sqlite" ? `, -1` : `, clinicos_now(), clinicos_origin()`;
  await q().run(
    `INSERT INTO "SyncTombstone" (id, "clinicId", "tableName", "rowId", "deletedAt"${cols}) VALUES (?, ?, ?, ?, ?${vals})
     ON CONFLICT (id) DO NOTHING`,
    tombstoneId(clinicId, table, id), clinicId, table, id, now()
  );
}

/** Values the sender may not get wrong: anything that is not text, a number or
 *  nothing is refused, and text is capped far above anything a clinic writes. */
function clean(table: SyncTable, r: Row): Row | null {
  const out: Row = {};
  for (const c of COLUMNS[table]) {
    const v = r[c];
    if (v === undefined || v === null) out[c] = null;
    else if (typeof v === "number" && Number.isFinite(v)) out[c] = v;
    else if (typeof v === "string" && v.length <= 400_000) out[c] = v;
    else return null;
  }
  if (typeof out[KEY[table]] !== "string" || !out[KEY[table]]) return null;
  return out;
}

/** The parent a row cannot exist without, in the same clinic. */
function parentOf(table: SyncTable, r: Row): [string, string] | null {
  switch (table) {
    case "Consult": return ["Patient", String(r.patientId ?? "")];
    case "Edit": return ["Consult", String(r.consultId ?? "")];
    case "PortalShare": return ["Consult", String(r.consultId ?? "")];
    case "QueueEntry": return ["Patient", String(r.patientId ?? "")];
    case "Bill": return ["Patient", String(r.patientId ?? "")];
    case "Recall": return ["Consult", String(r.consultId ?? "")];
    case "Favourite": return ["User", String(r.userId ?? "")];
    default: return null;
  }
}

async function insertRow(clinicId: ClinicId, table: SyncTable, r: Row) {
  const cols = COLUMNS[table];
  const extraCol = BACKEND === "sqlite" ? `, "syncSeq"` : "";
  const extraVal = BACKEND === "sqlite" ? `, -1` : "";
  await q().run(
    `INSERT INTO "${table}" ("clinicId", ${cols.map(q_).join(", ")}${extraCol})
     VALUES (?, ${cols.map(() => "?").join(", ")}${extraVal})`,
    clinicId, ...cols.map((c) => r[c])
  );
}

async function updateRow(clinicId: ClinicId, table: SyncTable, r: Row) {
  const key = KEY[table];
  const cols = COLUMNS[table].filter((c) => c !== key);
  const extra = BACKEND === "sqlite" ? `, "syncSeq" = -1` : "";
  await q().run(
    `UPDATE "${table}" SET ${cols.map((c) => `${q_(c)} = ?`).join(", ")}${extra}
     WHERE ${q_(key)} = ? AND "clinicId" = ?`,
    ...cols.map((c) => r[c]), r[key], clinicId
  );
}

const newer = (incoming: Row, existing: Row) => String(incoming.updatedAt ?? "") > String(existing.updatedAt ?? "");

/**
 * Merge a batch of one table's rows from the other copy into this clinic.
 * Rows are taken in order; see ApplyResult for why it can stop short.
 */
export async function applyChanges(clinicId: ClinicId, table: SyncTable, rows: unknown[]): Promise<ApplyResult> {
  const result: ApplyResult = { accepted: 0, conflicts: [], audioToRemove: [] };
  for (const raw of rows) {
    const r = raw && typeof raw === "object" ? clean(table, raw as Row) : null;
    if (!r) {
      result.conflicts.push(`A ${table} record could not be read and was left out.`);
      result.accepted++;
      continue;
    }
    const id = String(r[KEY[table]]);

    if (table === "ClinicSetting" && !isSharedSetting(id)) {
      result.accepted++;
      continue;
    }
    if (await tombstoned(clinicId, table, id)) {
      result.accepted++;
      continue;
    }
    const parent = parentOf(table, r);
    if (parent && !(await exists(clinicId, parent[0], parent[1]))) {
      if (await tombstoned(clinicId, parent[0], parent[1])) {
        // Its patient (or visit) was deleted here: it goes with them.
        await addTombstone(clinicId, table, id);
        result.accepted++;
        continue;
      }
      break; // the parent has not arrived yet
    }

    const outcome = await guarded(() => mergeRow(clinicId, table, r, result));
    if (!outcome.ok) {
      result.conflicts.push(describeRefusal(table, r, outcome.error));
    }
    result.accepted++;
  }
  return result;
}

async function mergeRow(clinicId: ClinicId, table: SyncTable, r: Row, result: ApplyResult) {
  const key = KEY[table];
  const existing = await q().get<Row>(
    `SELECT * FROM "${table}" WHERE ${q_(key)} = ? AND "clinicId" = ?`,
    r[key], clinicId
  );

  if (APPEND_ONLY.includes(table)) {
    if (!existing) await insertRow(clinicId, table, r);
    return;
  }

  if (table === "QueueEntry") {
    if (!existing || newer(r, existing)) await placeQueueEntry(clinicId, r, existing, result);
    return;
  }
  if (!existing) {
    await insertRow(clinicId, table, r);
    return;
  }
  if (table === "Consult") return mergeConsult(clinicId, r, existing, result);
  if (table === "Bill") return mergeBill(clinicId, r, existing, result);
  if (newer(r, existing)) await updateRow(clinicId, table, r);
}

/** The rules for a visit, which is not an ordinary row: see the top of this file. */
async function mergeConsult(clinicId: ClinicId, r: Row, existing: Row, result: ApplyResult) {
  if (existing.signedAt) return; // the record stands
  if (!r.signedAt && !newer(r, existing)) return;

  const merged: Row = { ...r };
  // The AI's first draft is kept as it was first written.
  if (existing.draftJson != null) merged.draftJson = existing.draftJson;
  if (r.signedAt && existing.audioPath) {
    // Signed on the other copy: this copy's recording goes, as promised.
    result.audioToRemove.push(String(existing.audioPath));
    merged.audioDeletedAt = r.audioDeletedAt ?? now();
    await q().run(`UPDATE "Consult" SET "audioPath" = NULL WHERE id = ? AND "clinicId" = ?`, existing.id, clinicId);
  }
  await updateRow(clinicId, "Consult", merged);
}

const PAYMENT = ["receiptNo", "receiptPrefix", "receiptSeq", "paidAt", "paidDay", "method", "receivedBy"] as const;
const CANCELLATION = ["voidedAt", "voidedBy", "voidReason"] as const;

/**
 * The rules for a bill. Its lines can only be written when it is made, so the
 * later version of the row is otherwise as good as the other; but a payment and
 * a cancellation are each recorded once and never undone. A copy that has not
 * heard of the payment yet must not wipe it out by being the later change —
 * the receipt was printed and is in a patient's hand.
 *
 * Paid in both places while the two were apart: the payment recorded first is
 * kept, and the clinic is told plainly so it can check whether the patient
 * paid twice. When the merged bill differs from what the other copy sent, it
 * goes back to that copy, which then agrees.
 */
async function mergeBill(clinicId: ClinicId, r: Row, existing: Row, result: ApplyResult) {
  // Starting from the later version keeps its updatedAt, so both copies settle
  // on the same row instead of sending it back and forth.
  const merged: Row = newer(r, existing) ? { ...r } : pick(existing, COLUMNS.Bill);
  if (existing.paidAt && r.paidAt) {
    if (existing.receiptNo !== r.receiptNo) {
      const [kept, other] = `${existing.paidAt}` <= `${r.paidAt}` ? [existing, r] : [r, existing];
      for (const c of PAYMENT) merged[c] = kept[c];
      result.conflicts.push(
        `One bill was paid in two places: receipt ${kept.receiptNo} was kept and receipt ${other.receiptNo} set aside. Check whether the patient paid twice.`
      );
    }
  } else {
    const paid = existing.paidAt ? existing : r.paidAt ? r : null;
    if (paid) for (const c of PAYMENT) merged[c] = paid[c];
  }
  const cancelled = [existing, r].filter((x) => x.voidedAt).sort((a, b) => String(a.voidedAt).localeCompare(String(b.voidedAt)))[0];
  if (cancelled) for (const c of CANCELLATION) merged[c] = cancelled[c];

  const differs = (a: Row, b: Row) => COLUMNS.Bill.some((c) => (a[c] ?? null) !== (b[c] ?? null));
  if (!differs(merged, existing)) return;
  if (!differs(merged, r)) {
    await updateRow(clinicId, "Bill", merged);
    return;
  }
  // The other copy is missing part of this: write it as this copy's own change,
  // so it is sent back.
  await asOwnChange(() => updateRow(clinicId, "Bill", merged), "Bill", String(merged.id), clinicId);
}

const pick = (row: Row, cols: string[]): Row => Object.fromEntries(cols.map((c) => [c, row[c] ?? null]));

/**
 * Two desks — one online, one on the clinic computer — can hand out the same
 * token on the same day while apart. Both copies must end up with the same
 * numbers, so the rule is the same on both sides: whoever was added first
 * keeps the token, and the other takes the next free number. A renumbering is
 * a change of this copy's own, so it travels back to the other copy, which
 * then agrees. A patient already waiting here is not put on the list twice.
 */
async function placeQueueEntry(clinicId: ClinicId, r: Row, existing: Row | undefined, result: ApplyResult) {
  if (!existing && (r.status === "waiting" || r.status === "with-doctor")) {
    const already = await q().get(
      `SELECT 1 AS x FROM "QueueEntry" WHERE "clinicId" = ? AND day = ? AND "patientId" = ? AND status IN ('waiting', 'with-doctor') AND id <> ?`,
      clinicId, r.day, r.patientId, r.id
    );
    if (already) {
      result.conflicts.push(`A patient was put on the ${r.day} list in both places; the entry already here was kept.`);
      return;
    }
  }

  const clash = await q().get<{ id: string; addedAt: string }>(
    `SELECT id, "addedAt" FROM "QueueEntry" WHERE "clinicId" = ? AND day = ? AND token = ? AND id <> ?`,
    clinicId, r.day, r.token, r.id
  );
  const nextFree = async () =>
    (await q().get<{ t: number }>(
      `SELECT CAST(COALESCE(MAX(token), 0) + 1 AS INTEGER) AS t FROM "QueueEntry" WHERE "clinicId" = ? AND day = ?`,
      clinicId, r.day
    ))!.t;

  let renumberIncoming = false;
  if (clash) {
    const incomingFirst = `${r.addedAt}|${r.id}` < `${clash.addedAt}|${clash.id}`;
    const next = await nextFree();
    result.conflicts.push(`Token ${r.token} on ${r.day} was given out in both places; one patient became token ${next}.`);
    if (incomingFirst) {
      await asOwnChange(() => q().run(`UPDATE "QueueEntry" SET token = ? WHERE id = ? AND "clinicId" = ?`, next, clash.id, clinicId), "QueueEntry", clash.id, clinicId);
    } else {
      r = { ...r, token: next };
      renumberIncoming = true;
    }
  }
  if (existing) await updateRow(clinicId, "QueueEntry", r);
  else await insertRow(clinicId, "QueueEntry", r);
  if (renumberIncoming) {
    // Touch it as this copy's own change, so the new number goes back.
    await asOwnChange(
      () => q().run(`UPDATE "QueueEntry" SET token = token WHERE id = ? AND "clinicId" = ?`, r.id, clinicId),
      "QueueEntry", String(r.id), clinicId
    );
  }
}

/**
 * Write something while merging as though this copy had changed it itself, so
 * that it is sent to the other copy. Online: for this statement, forget which
 * computer the batch came from. On the clinic computer: give the row a new
 * change number and a new updatedAt, since its triggers are standing aside.
 */
async function asOwnChange(write: () => Promise<unknown>, table: SyncTable, id: string, clinicId: ClinicId) {
  if (BACKEND === "postgres") {
    const origin = (await q().get<{ o: string | null }>(`SELECT clinicos_origin() AS o`))?.o ?? "";
    await q().get(`SELECT set_config('clinicos.device', '', true) AS x`);
    await write();
    // updatedAt is stamped by the trigger, as for any change made online.
    await q().get(`SELECT set_config('clinicos.device', ?, true) AS x`, origin);
    return;
  }
  await write();
  await q().run(`UPDATE "SyncState" SET seq = seq + 1 WHERE id = 1`);
  await q().run(
    `UPDATE "${table}" SET "syncSeq" = (SELECT seq FROM "SyncState" WHERE id = 1), "updatedAt" = ? WHERE id = ? AND "clinicId" = ?`,
    now(), id, clinicId
  );
}

function describeRefusal(table: SyncTable, r: Row, e: unknown): string {
  if (isUniqueViolation(e)) {
    if (table === "User") return `Two different accounts are called "${r.username}". Only the one already here was kept.`;
    if (table === "Favourite") return `A doctor has two favourites called "${r.name}". Only the one already here was kept.`;
    if (table === "Bill") return `Receipt ${r.receiptNo} was given to two different bills. Only the one already here was kept; tell Varaxis.`;
    return `A ${table} record clashed with one already here and was left out.`;
  }
  return `A ${table} record was refused: ${e instanceof Error ? e.message : String(e)}`;
}

/**
 * Deletions from the other copy. A patient goes with every visit, note and
 * entry on the list; their recordings on this computer are returned so the
 * caller can delete the files. The tombstone is kept, so the patient is never
 * brought back by a copy that has not heard yet.
 */
export async function applyTombstones(clinicId: ClinicId, tombs: unknown[]): Promise<ApplyResult> {
  const result: ApplyResult = { accepted: 0, conflicts: [], audioToRemove: [] };
  for (const raw of tombs) {
    result.accepted++;
    const t = raw as Partial<Tombstone>;
    const table = String(t?.tableName ?? "");
    const id = String(t?.rowId ?? "");
    if (!id || !["Patient", "Consult", "Favourite"].includes(table)) continue;

    if (table === "Patient") {
      const audio = await q().all<{ audioPath: string | null }>(
        `SELECT "audioPath" FROM "Consult" WHERE "clinicId" = ? AND "patientId" = ? AND "audioPath" IS NOT NULL`,
        clinicId, id
      );
      result.audioToRemove.push(...audio.map((a) => String(a.audioPath)));
    } else if (table === "Consult") {
      const c = await q().get<{ audioPath: string | null }>(
        `SELECT "audioPath" FROM "Consult" WHERE "clinicId" = ? AND id = ?`,
        clinicId, id
      );
      if (c?.audioPath) result.audioToRemove.push(c.audioPath);
    }
    await q().run(`DELETE FROM "${table}" WHERE id = ? AND "clinicId" = ?`, id, clinicId);
    // Online the delete trigger wrote the tombstone already; the clinic
    // computer's triggers are standing aside, so it is written here.
    await addTombstone(clinicId, table, id);
  }
  return result;
}
