/**
 * Patients' accounts on the portal: one per phone number, whichever clinics
 * shared with it. Server only; online only.
 *
 * Signing in the first time — and whenever the PIN is forgotten — takes the
 * phone number and a code printed on one of the patient's prescriptions, and
 * sets a 6-digit PIN. After that, the phone number and the PIN. Five wrong PINs
 * lock the account for fifteen minutes; ten wrong tries of any kind for one
 * number, in fifteen minutes, stop further tries for that number.
 *
 * A patient's cookie opens only their own shared visits. It opens nothing in
 * any clinic, and no clinic account's cookie opens anything here.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { BACKEND, q } from "./sql";
import { newId } from "./db";
import { hashToken } from "./auth";

export const PORTAL_ENABLED = BACKEND === "postgres";
export const PATIENT_COOKIE = "clinicos_patient";
/** A week without use. Patients read on their own phones, now and then. */
export const PATIENT_SESSION_SECONDS = 7 * 24 * 60 * 60;

const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES_PER_PHONE = 10;
const MAX_WRONG_PINS = 5;

export type PortalAccount = { id: string; phoneHmac: string };

const iso = (ms = Date.now()) => new Date(ms).toISOString();

export async function startPatientSession(accountId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const t = iso();
  await q().run(
    `INSERT INTO "PortalLogin" ("tokenHash", "accountId", "createdAt", "expiresAt", "lastSeenAt") VALUES (?, ?, ?, ?, ?)`,
    hashToken(token), accountId, t, iso(Date.now() + PATIENT_SESSION_SECONDS * 1000), t
  );
  await q().run(`UPDATE "PortalAccount" SET "lastLoginAt" = ? WHERE id = ?`, t, accountId);
  return token;
}

export function patientCookie(token: string, secure: boolean) {
  return { name: PATIENT_COOKIE, value: token, httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: PATIENT_SESSION_SECONDS, secure };
}

export const getCurrentPatient = cache(async (): Promise<PortalAccount | null> => {
  if (!PORTAL_ENABLED) return null;
  const token = (await cookies()).get(PATIENT_COOKIE)?.value;
  if (!token) return null;
  const row = await q().get<{ tokenHash: string; lastSeenAt: string; id: string; phoneHmac: string }>(
    `SELECT l."tokenHash", l."lastSeenAt", a.id, a."phoneHmac"
     FROM "PortalLogin" l JOIN "PortalAccount" a ON a.id = l."accountId"
     WHERE l."tokenHash" = ? AND l."expiresAt" > ?`,
    hashToken(token), iso()
  );
  if (!row) return null;
  if (Date.now() - Date.parse(row.lastSeenAt) > 60 * 60 * 1000) {
    await q().run(
      `UPDATE "PortalLogin" SET "lastSeenAt" = ?, "expiresAt" = ? WHERE "tokenHash" = ?`,
      iso(), iso(Date.now() + PATIENT_SESSION_SECONDS * 1000), row.tokenHash
    );
  }
  return { id: row.id, phoneHmac: row.phoneHmac };
});

export async function endPatientSession(): Promise<void> {
  const token = (await cookies()).get(PATIENT_COOKIE)?.value;
  if (token) await q().run(`DELETE FROM "PortalLogin" WHERE "tokenHash" = ?`, hashToken(token));
}

// --------------------------------------------------------------- guessing
export async function tooManyTries(phoneHmac: string): Promise<boolean> {
  await q().run(`DELETE FROM "PortalAttempt" WHERE at < ?`, iso(Date.now() - 24 * 60 * 60 * 1000));
  const n = await q().get<{ n: number }>(
    `SELECT CAST(COUNT(*) AS INTEGER) AS n FROM "PortalAttempt" WHERE "phoneHmac" = ? AND at > ?`,
    phoneHmac, iso(Date.now() - WINDOW_MS)
  );
  return (n?.n ?? 0) >= MAX_TRIES_PER_PHONE;
}

export async function noteWrongTry(phoneHmac: string) {
  await q().run(`INSERT INTO "PortalAttempt" ("phoneHmac", at) VALUES (?, ?)`, phoneHmac, iso());
}

export type AccountRow = { id: string; phoneHmac: string; pinHash: string; failedAttempts: number; lockedUntil: string | null };

export function getAccountByPhone(phoneHmac: string): Promise<AccountRow | undefined> {
  return q().get<AccountRow>(`SELECT * FROM "PortalAccount" WHERE "phoneHmac" = ?`, phoneHmac);
}

export function isLocked(a: AccountRow): boolean {
  return !!a.lockedUntil && a.lockedUntil > iso();
}

export async function noteWrongPin(a: AccountRow) {
  const failed = a.failedAttempts + 1;
  await q().run(
    `UPDATE "PortalAccount" SET "failedAttempts" = ?, "lockedUntil" = ? WHERE id = ?`,
    failed >= MAX_WRONG_PINS ? 0 : failed,
    failed >= MAX_WRONG_PINS ? iso(Date.now() + WINDOW_MS) : a.lockedUntil,
    a.id
  );
}

/** Create the account for a phone, or set a new PIN on it. A printed code is
 *  what proves the patient, so it also lifts a lock. */
export async function setAccountPin(phoneHmac: string, pinHash: string): Promise<string> {
  const existing = await getAccountByPhone(phoneHmac);
  if (existing) {
    await q().run(
      `UPDATE "PortalAccount" SET "pinHash" = ?, "failedAttempts" = 0, "lockedUntil" = NULL WHERE id = ?`,
      pinHash, existing.id
    );
    await q().run(`DELETE FROM "PortalLogin" WHERE "accountId" = ?`, existing.id);
    return existing.id;
  }
  const id = newId();
  await q().run(
    `INSERT INTO "PortalAccount" (id, "phoneHmac", "pinHash", "failedAttempts", "createdAt") VALUES (?, ?, ?, 0, ?)`,
    id, phoneHmac, pinHash, iso()
  );
  return id;
}

export async function clearPinFailures(accountId: string) {
  await q().run(`UPDATE "PortalAccount" SET "failedAttempts" = 0, "lockedUntil" = NULL WHERE id = ?`, accountId);
}

// ----------------------------------------------------------------- visits
export type VisitListing = { id: string; visitDate: string; payloadEnc: string };

/** The visits shared with this phone and still shared, newest first. */
export function visitsFor(account: PortalAccount): Promise<VisitListing[]> {
  return q().all<VisitListing>(
    `SELECT id, "visitDate", "payloadEnc" FROM "PortalShare"
     WHERE "phoneHmac" = ? AND "revokedAt" IS NULL AND "hiddenAt" IS NULL AND "payloadEnc" IS NOT NULL
     ORDER BY "visitDate" DESC, "sharedAt" DESC`,
    account.phoneHmac
  );
}

/** One shared visit, if it is this patient's and still shared. A revoked or
 *  someone else's visit is the same "not there", even by its direct address. */
export function visitFor(account: PortalAccount, id: string): Promise<VisitListing | undefined> {
  return q().get<VisitListing>(
    `SELECT id, "visitDate", "payloadEnc" FROM "PortalShare"
     WHERE id = ? AND "phoneHmac" = ? AND "revokedAt" IS NULL AND "hiddenAt" IS NULL AND "payloadEnc" IS NOT NULL`,
    id, account.phoneHmac
  );
}
