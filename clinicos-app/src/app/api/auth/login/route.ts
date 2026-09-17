import { NextRequest, NextResponse } from "next/server";
import { failedLoginsSince, getUserByUsername, pruneExpiredSessions, recordAudit, touchLogin } from "@/lib/db";
import {
  burnPasswordCheck,
  homeFor,
  safeNextPath,
  sessionCookie,
  startSession,
  toSessionUser,
  verifyPassword,
} from "@/lib/auth";

// Wrong passwords per username in the last 15 minutes, counted from the
// activity log. It used to be a counter in memory, which is fine on one laptop
// but useless online, where each of many short-lived server copies starts with
// an empty one. A successful sign-in starts the count again.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const user = await getUserByUsername(username);
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const since = user?.lastLoginAt && user.lastLoginAt > windowStart ? user.lastLoginAt : windowStart;
  if ((await failedLoginsSince(username, since)) >= MAX_FAILS) {
    return NextResponse.json(
      { error: "Too many wrong attempts. Wait 15 minutes, or ask whoever manages the clinic to reset your password." },
      { status: 429 }
    );
  }

  let ok = false;
  if (user && user.active) ok = await verifyPassword(password, user.passwordHash);
  else await burnPasswordCheck(password);

  if (!user || !ok) {
    await recordAudit(null, "login_failed", "user", user?.id ?? null, `username: ${username}`);
    return NextResponse.json({ error: "That username and password don't match." }, { status: 401 });
  }

  await pruneExpiredSessions();
  const token = await startSession(user.id);
  await touchLogin(user.id);
  await recordAudit(user, "login", "user", user.id);

  const redirectTo = user.mustChangePassword
    ? "/account/password"
    : safeNextPath(body.next) ?? homeFor(toSessionUser(user));

  const res = NextResponse.json({ ok: true, redirect: redirectTo });
  res.cookies.set(sessionCookie(token, req.nextUrl.protocol === "https:"));
  return res;
}
