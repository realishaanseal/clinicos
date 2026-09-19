import { NextRequest, NextResponse } from "next/server";
import { failedLoginsSince, getOperatorByUsername, recordAudit, touchOperatorLogin } from "@/lib/db";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth";
import { PLATFORM_ENABLED, operatorCookie, startOperatorSession } from "@/lib/platform";

// Fewer tries than a clinic sign-in allows: an operator account can change
// what any clinic has.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

export async function POST(req: NextRequest) {
  if (!PLATFORM_ENABLED) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const op = await getOperatorByUsername(username);
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const since = op?.lastLoginAt && op.lastLoginAt > windowStart ? op.lastLoginAt : windowStart;
  if ((await failedLoginsSince(null, username, since, "operator_login_failed")) >= MAX_FAILS) {
    return NextResponse.json({ error: "Too many wrong attempts. Wait 15 minutes." }, { status: 429 });
  }

  let ok = false;
  if (op && op.active) ok = await verifyPassword(password, op.passwordHash);
  else await burnPasswordCheck(password);

  if (!op || !ok) {
    await recordAudit(null, null, "operator_login_failed", "operator", op?.id ?? null, `username: ${username}`);
    return NextResponse.json({ error: "That username and password don't match." }, { status: 401 });
  }

  const token = await startOperatorSession(op.id);
  await touchOperatorLogin(op.id);
  await recordAudit(null, { id: op.id, name: op.name }, "operator_login", "operator", op.id);

  const res = NextResponse.json({ ok: true, redirect: op.mustChangePassword ? "/platform/password" : "/platform" });
  res.cookies.set(operatorCookie(token, req.nextUrl.protocol === "https:"));
  return res;
}
