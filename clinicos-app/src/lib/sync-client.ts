/**
 * The clinic computer's side of keeping in step with its clinic online.
 *
 * Runs only on a clinic computer (SQLite), and only once the clinic has
 * connected it with a key from its online clinic. Then, every minute or so
 * while ClinicOS is open, and whenever someone presses Sync now:
 *   1. send this computer's changes, table by table, parents first
 *   2. fetch what changed online, the same way
 * Each side merges by the rules in sync.ts. Nothing here ever waits in front
 * of a consultation: the app works exactly as before with no internet at all,
 * and catches up when it has some.
 *
 * Server only.
 */
import { BACKEND, q } from "./sql";
import { FIRST_CLINIC_ID, recordAudit } from "./db";
import {
  SYNC_TABLES,
  applyChanges,
  applyTombstones,
  inApplyTransaction,
  page,
  readChanges,
  readTombstones,
  type ApplyResult,
  type Cursor,
} from "./sync";
import { removeAudio } from "./audio-store";

export const SYNC_CLIENT_ENABLED = BACKEND === "sqlite";

const CLINIC = FIRST_CLINIC_ID;
const ORDER = ["SyncTombstone", ...SYNC_TABLES] as const;
const PUSH_ROWS = 200;
const PUSH_BYTES = 2_000_000;
const PULL_ROWS = 200;
/** Changes written online in the few minutes before a fetch may still have
 *  been in flight when it ran; each run looks back this far again. */
const REWIND_MS = 5 * 60 * 1000;
const EVERY_MS = 60 * 1000;
const TIMEOUT_MS = 30 * 1000;

// ------------------------------------------------------------ bookkeeping
async function getConfig(): Promise<Record<string, string>> {
  const rows = await q().all<{ key: string; value: string }>(`SELECT key, value FROM "SyncConfig"`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function setConfig(values: Record<string, string | null>) {
  for (const [k, v] of Object.entries(values)) {
    if (v === null) await q().run(`DELETE FROM "SyncConfig" WHERE key = ?`, k);
    else await q().run(`INSERT INTO "SyncConfig" (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, k, v);
  }
}

const readCursor = (cfg: Record<string, string>, k: string): Cursor | null => {
  try {
    const c = JSON.parse(cfg[k] || "null");
    return c && typeof c.at === "string" && typeof c.key === "string" ? c : null;
  } catch {
    return null;
  }
};

export type SyncStatus = {
  connected: boolean;
  url: string | null;
  clinicName: string | null;
  clinicSlug: string | null;
  deviceName: string | null;
  lastOkAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  clockOffset: number | null;
  waiting: number;
  unsent: number;
  conflicts: { at: string; text: string }[];
  prototype: boolean;
};

export async function getSyncStatus(): Promise<SyncStatus> {
  const cfg = SYNC_CLIENT_ENABLED ? await getConfig() : {};
  let unsent = 0;
  if (cfg.sync_key) {
    // Rows changed here since the last send, over every table.
    for (const t of ORDER) {
      const c = readCursor(cfg, `push:${t}`);
      const n = await q().get<{ n: number }>(
        `SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "${t}" WHERE "clinicId" = ? AND COALESCE("syncSeq", 0) > ?`,
        CLINIC, c ? Number(c.at) : 0
      );
      unsent += n?.n ?? 0;
    }
  }
  let conflicts: SyncStatus["conflicts"] = [];
  try {
    conflicts = JSON.parse(cfg.sync_conflicts || "[]");
  } catch {
    /* none */
  }
  return {
    connected: !!cfg.sync_key,
    url: cfg.sync_url ?? null,
    clinicName: cfg.sync_clinic_name ?? null,
    clinicSlug: cfg.sync_clinic_slug ?? null,
    deviceName: cfg.sync_device_name ?? null,
    lastOkAt: cfg.sync_last_ok_at ?? null,
    lastAttemptAt: cfg.sync_last_attempt_at ?? null,
    lastError: cfg.sync_last_error || null,
    clockOffset: cfg.sync_clock_offset ? Number(cfg.sync_clock_offset) : null,
    waiting: Number(cfg.sync_waiting || 0),
    unsent,
    conflicts,
    prototype: cfg.sync_prototype === "1",
  };
}

async function noteConflicts(list: string[]) {
  if (!list.length) return;
  const cfg = await getConfig();
  let old: { at: string; text: string }[] = [];
  try {
    old = JSON.parse(cfg.sync_conflicts || "[]");
  } catch {
    /* start again */
  }
  const at = new Date().toISOString();
  await setConfig({ sync_conflicts: JSON.stringify([...list.map((text) => ({ at, text })), ...old].slice(0, 30)) });
}

// ------------------------------------------------------------ the network
/** The online address as people paste it: with or without /c/<clinic>, with
 *  or without a trailing slash. Plain http only for this computer itself. */
export function normaliseUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
  const path = u.pathname.replace(/\/c\/[^/]*\/?$/, "").replace(/\/(login|setup)\/?$/, "").replace(/\/+$/, "");
  return `${u.origin}${path}`;
}

export class SyncError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

async function call<T>(url: string, key: string, path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "x-clinicos-time": new Date().toISOString(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SyncError("Couldn't reach ClinicOS online. Everything here keeps working; it will catch up when the internet is back.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SyncError(data.error || `ClinicOS online answered ${res.status}.`, res.status);
  return data as T;
}

export type Hello = {
  clinic: { name: string; slug: string };
  device: { id: string; name: string };
  prototype: boolean;
  accounts: { id: string; username: string }[];
  serverTime: string;
  clockOffset: number | null;
};

// ------------------------------------------------------------ connecting
/** Refused because the online copy is still the made-up-patients prototype. */
export class PrototypeRefusal extends SyncError {}

/**
 * Connect this computer to its clinic online. Refused if the same username
 * belongs to a different person in each place, because merging them would
 * hand one person's account to the other. Returns what online said, so the
 * screen can name the clinic.
 */
export async function connect(
  rawUrl: string,
  key: string,
  by: { id: string; name: string } | null,
  madeUpOnly: boolean
): Promise<Hello> {
  if (!SYNC_CLIENT_ENABLED) throw new SyncError("Only a ClinicOS install on a clinic's own computer connects to its clinic online.");
  const url = normaliseUrl(rawUrl);
  if (!url) throw new SyncError("Paste the online address as it appears in the browser, starting with https://.");
  if (!key.trim().startsWith("cos_")) throw new SyncError("That doesn't look like a clinic computer key. It starts with cos_.");

  const hello = await call<Hello>(url, key.trim(), "/api/sync/hello", { connecting: false });
  // The online copy is still the made-up-patients prototype until the consent
  // script covers keeping records online (CONTEXT.md). Real patients must not
  // be sent there, so the clinic has to say these are made up.
  if (hello.prototype && !madeUpOnly) {
    throw new PrototypeRefusal(
      "ClinicOS online is still a prototype for made-up patients. Connect only a computer that holds made-up patients."
    );
  }
  const here = await q().all<{ id: string; username: string }>(`SELECT id, username FROM "User" WHERE "clinicId" = ?`, CLINIC);
  const clash = here.filter((h) => hello.accounts.some((a) => a.username.toLowerCase() === h.username.toLowerCase() && a.id !== h.id));
  if (clash.length) {
    throw new SyncError(
      `The username${clash.length > 1 ? "s" : ""} ${clash.map((c) => `"${c.username}"`).join(", ")} belong${clash.length > 1 ? "" : "s"} to different people here and online. Ask Varaxis to help join the two before connecting.`
    );
  }

  // Start from nothing sent and nothing fetched: the first run sends every
  // record here and fetches every record there.
  const cfg = await getConfig();
  const reset: Record<string, string | null> = {};
  for (const k of Object.keys(cfg)) if (k.startsWith("push:") || k.startsWith("pull:")) reset[k] = null;
  await setConfig({
    ...reset,
    sync_url: url,
    sync_key: key.trim(),
    sync_clinic_name: hello.clinic.name,
    sync_clinic_slug: hello.clinic.slug,
    sync_device_name: hello.device.name,
    sync_prototype: hello.prototype ? "1" : "0",
    sync_last_error: "",
    sync_conflicts: "[]",
    sync_clock_offset: String(hello.clockOffset ?? 0),
  });
  if (by) await recordAudit(CLINIC, by, "sync_connect", "device", null, `connected to ${hello.clinic.name} online`);
  // Tell online too, so its log shows when this computer joined.
  await call(url, key.trim(), "/api/sync/hello", { connecting: true }).catch(() => {});
  return hello;
}

/** Stop keeping in step. Nothing is deleted anywhere: this computer keeps its
 *  records and works on its own, and the online copy keeps its own. */
export async function disconnect(by: { id: string; name: string }) {
  const cfg = await getConfig();
  const drop: Record<string, null> = {};
  for (const k of Object.keys(cfg)) drop[k] = null;
  await setConfig(drop);
  await recordAudit(CLINIC, by, "sync_disconnect", "device", null, "stopped keeping in step with ClinicOS online");
}

// ------------------------------------------------------------ one run
export type RunReport = { sent: number; fetched: number; conflicts: string[]; waiting: number };

let running: Promise<RunReport> | null = null;
let lastRunAt = 0;

/** Run now, or join the run already going. */
export function syncNow(): Promise<RunReport> {
  if (!running) {
    running = run().finally(() => {
      running = null;
      lastRunAt = Date.now();
    });
  }
  return running;
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Called on every page load. Starts the once-a-minute timer the first time,
 * and runs now if the last run was a while ago. Never awaited, never throws:
 * nothing about syncing is allowed to slow down or break a page.
 */
export function maybeSync(): void {
  if (!SYNC_CLIENT_ENABLED) return;
  if (!timer) {
    timer = setInterval(() => void quietly(), EVERY_MS);
    timer.unref?.();
  }
  if (Date.now() - lastRunAt > EVERY_MS) void quietly();
}

async function quietly() {
  try {
    const cfg = await getConfig();
    if (cfg.sync_key) await syncNow();
  } catch {
    /* recorded in sync_last_error by run() */
  }
}

async function run(): Promise<RunReport> {
  const cfg = await getConfig();
  const url = cfg.sync_url;
  const key = cfg.sync_key;
  if (!url || !key) throw new SyncError("This computer isn't connected to ClinicOS online.");
  await setConfig({ sync_last_attempt_at: new Date().toISOString() });

  const report: RunReport = { sent: 0, fetched: 0, conflicts: [], waiting: 0 };
  try {
    const hello = await call<Hello>(url, key, "/api/sync/hello", {});
    await setConfig({
      sync_clinic_name: hello.clinic.name,
      sync_prototype: hello.prototype ? "1" : "0",
      sync_clock_offset: String(hello.clockOffset ?? 0),
    });

    // 1. Send. Deletions first, then parents before children, so the online
    //    copy always has a visit's patient before the visit.
    for (const table of ORDER) {
      for (;;) {
        const after = readCursor(await getConfig(), `push:${table}`);
        const entries = table === "SyncTombstone"
          ? await readTombstones(CLINIC, after, PUSH_ROWS)
          : await readChanges(CLINIC, table, after, PUSH_ROWS);
        if (!entries.length) break;
        const { rows, more } = page<unknown>(entries, PUSH_ROWS, PUSH_BYTES);
        // How far to move the cursor: past the rows online dealt with.
        const sentEntries = entries.slice(0, entries.findIndex((e) => e.row === rows.at(-1)) + 1 || entries.length);
        const res = rows.length
          ? await call<{ accepted: number; conflicts: string[] }>(url, key, "/api/sync/push", { table, rows }).catch(olderOnline)
          : { accepted: 0, conflicts: [] };
        if (!res) break; // this table waits until the online copy knows it
        report.sent += res.accepted;
        report.conflicts.push(...res.conflicts);
        // Walk the entries, counting sent rows, to find where online stopped.
        let accepted = res.accepted;
        let upto: Cursor | null = null;
        let stopped = false;
        for (const e of sentEntries) {
          if (e.row) {
            if (accepted === 0) {
              stopped = true;
              break;
            }
            accepted--;
          }
          upto = e.cursor;
        }
        if (upto) await setConfig({ [`push:${table}`]: JSON.stringify(upto) });
        if (stopped) {
          report.waiting++;
          break; // its parent goes first; the rest of this table waits for the next run
        }
        if (!more) break;
      }
    }

    // 2. Fetch. Looking back a few minutes each time, for changes online that
    //    were still being written when the last fetch ran.
    for (const table of ORDER) {
      const saved = readCursor(await getConfig(), `pull:${table}`);
      let after: Cursor | null = saved
        ? { at: new Date(Math.max(0, Date.parse(saved.at) - REWIND_MS)).toISOString(), key: "" }
        : null;
      for (;;) {
        const got = await call<{ rows: unknown[]; next: Cursor | null; more: boolean }>(url, key, "/api/sync/pull", {
          table,
          after,
          limit: PULL_ROWS,
        }).catch(olderOnline);
        if (!got) break;
        let result: ApplyResult = { accepted: got.rows.length, conflicts: [], audioToRemove: [] };
        if (got.rows.length) {
          result = await inApplyTransaction(null, () =>
            table === "SyncTombstone" ? applyTombstones(CLINIC, got.rows) : applyChanges(CLINIC, table, got.rows)
          );
          for (const p of result.audioToRemove) await removeAudio(p);
        }
        report.fetched += result.accepted;
        report.conflicts.push(...result.conflicts);
        if (result.accepted < got.rows.length) {
          // Waiting on a parent that has not arrived: fetch this table again
          // from here next time. Only possible if online changed mid-run.
          report.waiting++;
          break;
        }
        if (got.next && (!saved || got.next.at >= saved.at)) {
          await setConfig({ [`pull:${table}`]: JSON.stringify(got.next) });
        }
        after = got.next;
        if (!got.more || !got.next) break;
      }
    }

    await noteConflicts(report.conflicts);
    await setConfig({ sync_last_ok_at: new Date().toISOString(), sync_last_error: "", sync_waiting: String(report.waiting) });
    return report;
  } catch (e) {
    await noteConflicts(report.conflicts);
    const message = e instanceof Error ? e.message : String(e);
    await setConfig({ sync_last_error: message });
    throw e;
  }
}

/**
 * A table this computer knows and the online copy does not yet: the computer
 * was updated first. Its rows wait here, unsent, until online catches up,
 * rather than stopping every other table from keeping in step.
 */
function olderOnline(e: unknown): null {
  if (e instanceof SyncError && e.status === 400 && e.message === "Unknown table.") return null;
  throw e;
}

// ------------------------------------------------------------ sharing
/**
 * Share a signed visit with the patient from a clinic computer: the portal is
 * online, so online makes the share. Syncs first, so the signed visit is there
 * to share, and again afterwards (without waiting) to bring the share's record
 * back here. Needs the internet at that moment; says so plainly if not.
 */
export async function shareThroughOnline(
  consultId: string,
  action: "share" | "revoke",
  by: string,
  consentBy: string
): Promise<{ code?: string; portalUrl: string; ok?: boolean }> {
  const cfg = await getConfig();
  if (!cfg.sync_url || !cfg.sync_key) {
    throw new SyncError("Sharing with patients needs this computer connected to ClinicOS online (Clinic admin → ClinicOS online).");
  }
  if (action === "share") await syncNow();
  const res = await call<{ code?: string; ok?: boolean }>(cfg.sync_url, cfg.sync_key, "/api/sync/share", {
    consultId,
    action,
    by,
    consentBy,
  });
  void syncNow().catch(() => {});
  return { ...res, portalUrl: `${cfg.sync_url}/p` };
}
