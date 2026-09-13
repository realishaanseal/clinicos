import { NextRequest, NextResponse } from "next/server";
import { getUserByUsername, pruneExpiredSessions, recordAudit, touchLogin } from "@/lib/db";
import {
  burnPasswordCheck,
  homeFor,
  safeNextPath,
  sessionCookie,
  startSession,
  toSessionUser,
  verifyPassword,
} from "@/lib/auth";

// Failed attempts per username, in memory. Enough to stop someone on the clinic
// Wi-Fi guessing a password all afternoon; it resets if the app restarts, which
// on one laptop is an acceptable trade for not adding a table.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const failures = new Map<string, { count: number; since: number }>();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const f = failures.get(username);
  if (f && Date.now() - f.since > WINDOW_MS) failures.delete(username);
  else if (f && f.count >= MAX_FAILS) {
    return NextResponse.json(
      { error: "Too many wrong attempts. Wait 15 minutes, or ask whoever manages the clinic to reset your password." },
      { status: 429 }
    );
  }

  const user = getUserByUsername(username);
  let ok = false;
  if (user && user.active) ok = await verifyPassword(password, user.passwordHash);
  else await burnPasswordCheck(password);

  if (!user || !ok) {
    const prev = failures.get(username);
    failures.set(username, { count: (prev?.count ?? 0) + 1, since: prev?.since ?? Date.now() });
    recordAudit(null, "login_failed", "user", user?.id ?? null, `username: ${username}`);
    return NextResponse.json({ error: "That username and password don't match." }, { status: 401 });
  }

  failures.delete(username);
  pruneExpiredSessions();
  const token = startSession(user.id);
  touchLogin(user.id);
  recordAudit(user, "login", "user", user.id);

  const redirectTo = user.mustChangePassword
    ? "/account/password"
    : safeNextPath(body.next) ?? homeFor(toSessionUser(user));

  const res = NextResponse.json({ ok: true, redirect: redirectTo });
  res.cookies.set(sessionCookie(token, req.nextUrl.protocol === "https:"));
  return res;
}
