import { NextResponse } from "next/server";
import { deleteSession, recordAudit } from "@/lib/db";
import { currentTokenHash, getCurrentUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session-cookie";

export async function POST() {
  const user = await getCurrentUser();
  const tokenHash = await currentTokenHash();
  if (tokenHash) deleteSession(tokenHash);
  if (user) recordAudit(user, "logout", "user", user.id);

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
