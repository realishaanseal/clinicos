import { NextRequest, NextResponse } from "next/server";
import { deleteSessionsForUser, getUserRow, recordAudit, setUserPassword } from "@/lib/db";
import { currentTokenHash, getCurrentUser, hashPassword, homeFor, verifyPassword } from "@/lib/auth";
import { passwordProblem } from "@/lib/users";

/** Change your own password. Also the only thing a temporary password allows. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");

  const row = await getUserRow(user.id);
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    return NextResponse.json({ error: "Your current password isn't right." }, { status: 400 });
  }
  const problem = passwordProblem(next);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (next === current) {
    return NextResponse.json({ error: "Choose a password different from the current one." }, { status: 400 });
  }

  await setUserPassword(user.id, await hashPassword(next), false);
  // Anyone else signed in as this person is signed out; this browser stays in.
  await deleteSessionsForUser(user.id, await currentTokenHash());
  await recordAudit(user, "password_change", "user", user.id);

  return NextResponse.json({ ok: true, redirect: homeFor({ ...user, mustChangePassword: false }) });
}
