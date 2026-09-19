/**
 * The platform console: Varaxis's own screens for setting clinics up, and for
 * recording what each clinic bought.
 *
 * Online only. On a clinic computer there is one clinic and nobody to sell it
 * to, so every page and route here answers 404 there.
 *
 * Operators are not clinic accounts. They sign in with their own cookie
 * against their own table, and nothing they can reach reads a patient, a note
 * or a clinic's people: the console shows counts, never records. Server only.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { BACKEND } from "./sql";
import { getOperatorSession, insertOperatorSession, touchOperatorSession } from "./db";
import { hashToken } from "./auth";
import { OPERATOR_COOKIE } from "./session-cookie";

export const PLATFORM_ENABLED = BACKEND === "postgres";

/** Shorter than a clinic's twelve hours: nobody records a consultation here,
 *  and an operator session can change what any clinic has. */
export const OPERATOR_SESSION_SECONDS = 4 * 60 * 60;

export type Operator = { id: string; name: string; username: string; mustChangePassword: boolean };

const expiry = () => new Date(Date.now() + OPERATOR_SESSION_SECONDS * 1000).toISOString();

export async function startOperatorSession(operatorId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await insertOperatorSession(hashToken(token), operatorId, expiry());
  return token;
}

export function operatorCookie(token: string, secure: boolean) {
  return {
    name: OPERATOR_COOKIE,
    value: token,
    httpOnly: true,
    // Strict: nothing on another site can make a browser send it along.
    sameSite: "strict" as const,
    path: "/",
    maxAge: OPERATOR_SESSION_SECONDS,
    secure,
  };
}

export const getCurrentOperator = cache(async (): Promise<Operator | null> => {
  if (!PLATFORM_ENABLED) return null;
  const token = (await cookies()).get(OPERATOR_COOKIE)?.value;
  if (!token) return null;
  const row = await getOperatorSession(hashToken(token));
  if (!row) return null;
  if (Date.now() - Date.parse(row.lastSeenAt) > 5 * 60 * 1000) await touchOperatorSession(row.tokenHash, expiry());
  return { id: row.id, name: row.name, username: row.username, mustChangePassword: !!row.mustChangePassword };
});

export async function currentOperatorTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(OPERATOR_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** For pages. */
export async function requireOperator(opts: { allowPasswordChange?: boolean } = {}): Promise<Operator> {
  if (!PLATFORM_ENABLED) notFound();
  const op = await getCurrentOperator();
  if (!op) redirect("/platform/login");
  if (op.mustChangePassword && !opts.allowPasswordChange) redirect("/platform/password");
  return op;
}

/** For route handlers: JSON, never a redirect. */
export async function requireApiOperator(
  opts: { allowPasswordChange?: boolean } = {}
): Promise<{ op: Operator; denied?: undefined } | { op?: undefined; denied: NextResponse }> {
  if (!PLATFORM_ENABLED) return { denied: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const op = await getCurrentOperator();
  if (!op) return { denied: NextResponse.json({ error: "Please sign in again." }, { status: 401 }) };
  if (op.mustChangePassword && !opts.allowPasswordChange) {
    return { denied: NextResponse.json({ error: "Choose a new password before continuing." }, { status: 403 }) };
  }
  return { op };
}

/** Written into the log as who did it, so a clinic reading its own log sees
 *  that Varaxis made the change, and which person at Varaxis. */
export function operatorActor(op: Operator) {
  return { id: op.id, name: `Varaxis (${op.name})` };
}
