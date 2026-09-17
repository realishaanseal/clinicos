/**
 * Accounts, sessions and permissions.
 *
 * Every page calls requireUser() and every route handler calls
 * requireApiUser() with the capability it needs. The middleware only checks
 * that a session cookie exists; the real check is here, on every request, in
 * the same process as the database. Hiding a button is never the control.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import {
  getSessionUser,
  insertSession,
  touchSession,
  type Role,
  type SessionJoin,
  type UserRow,
} from "./db";
import { SESSION_COOKIE, SESSION_SECONDS } from "./session-cookie";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  isAdmin: boolean;
  qualification: string | null;
  regNo: string | null;
  mustChangePassword: boolean;
};

// ------------------------------------------------------------ passwords
// scrypt from node:crypto: memory-hard, built in, no dependency to install on
// a clinic laptop. N=2^15 needs ~33 MB, just over Node's 32 MB default, hence
// maxmem. Parameters are stored in the hash so they can be raised later
// without invalidating existing passwords.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function scryptKey(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptKey(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptKey(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_MAXMEM,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummyHash: Promise<string> | null = null;
/** Spend the same time on an unknown username as on a wrong password, so the
 *  sign-in form cannot be used to find out which usernames exist. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-account");
  await verifyPassword(password, await dummyHash);
}

// Letters and digits that survive being read aloud or copied by hand: no i, l,
// o, 0 or 1.
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A one-time password an admin hands over in person. */
export function generateTempPassword(length = 10): string {
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b >= 248) continue; // 248 = 8 × 31, so every character is equally likely
      out += TEMP_ALPHABET[b % TEMP_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

// ------------------------------------------------------------- sessions
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const expiry = () => new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();

/** Create a session and return the raw token for the cookie. Only its hash is stored. */
export async function startSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await insertSession(hashToken(token), userId, expiry());
  return token;
}

export function sessionCookie(token: string, secure: boolean) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
    // The clinic app is normally served over plain http on the clinic's own
    // network, where a Secure cookie would never be sent back.
    secure,
  };
}

export function toSessionUser(row: SessionJoin | UserRow): SessionUser {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    isAdmin: !!row.isAdmin,
    qualification: row.qualification,
    regNo: row.regNo,
    mustChangePassword: !!row.mustChangePassword,
  };
}

/** The signed-in account for this request, or null. Cached per request, so the
 *  layout and the page share one lookup. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await getSessionUser(hashToken(token));
  if (!row) return null;
  // Slide the idle expiry, but write at most every five minutes.
  if (Date.now() - Date.parse(row.lastSeenAt) > 5 * 60 * 1000) await touchSession(row.tokenHash, expiry());
  return toSessionUser(row);
});

export async function currentTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

// ---------------------------------------------------------- permissions
/**
 *   clinical  — transcripts, notes, signing, prescriptions, patient history
 *   frontdesk — registering and finding patients, recording consent
 *   admin     — people, clinic details, backups, deletion, the activity log
 *
 * A non-clinical admin deliberately has no clinical access. A doctor who also
 * runs the clinic has both.
 */
export type Capability = "clinical" | "frontdesk" | "admin";

export function can(user: SessionUser, cap: Capability): boolean {
  switch (cap) {
    case "clinical":
      return user.role === "doctor";
    case "frontdesk":
      return user.role === "doctor" || user.role === "staff";
    case "admin":
      return user.role === "admin" || user.isAdmin;
  }
}

/** Where each account lands. Each of these pages must be reachable by that
 *  role, or requireUser would redirect in a loop. "/" shows a doctor their
 *  Today and the front desk theirs. */
export function homeFor(user: SessionUser): string {
  return user.role === "admin" ? "/admin" : "/";
}

/** Only same-site paths, so ?next= cannot send someone to another website. */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/** For pages. Redirects instead of rendering anything the user may not see. */
export async function requireUser(
  cap?: Capability,
  opts: { allowPasswordChange?: boolean } = {}
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/account/password");
  if (cap && !can(user, cap)) redirect(homeFor(user));
  return user;
}

/** For route handlers. Mirrors the consent gate: a JSON 401 or 403, never a redirect. */
export async function requireApiUser(
  cap?: Capability
): Promise<{ user: SessionUser; denied?: undefined } | { user?: undefined; denied: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { denied: NextResponse.json({ error: "Please sign in again." }, { status: 401 }) };
  }
  if (user.mustChangePassword) {
    return { denied: NextResponse.json({ error: "Choose a new password before continuing." }, { status: 403 }) };
  }
  if (cap && !can(user, cap)) {
    return { denied: NextResponse.json({ error: "Your account doesn't have access to this." }, { status: 403 }) };
  }
  return { user };
}
