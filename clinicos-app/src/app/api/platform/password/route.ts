import { NextRequest, NextResponse } from "next/server";
import { deleteOperatorSessions, getOperatorRow, recordAudit, setOperatorPassword } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { currentOperatorTokenHash, requireApiOperator } from "@/lib/platform";

/** An operator account can change any clinic's plan, so its password is held
 *  to a longer minimum than a clinic account's. */
const OPERATOR_PASSWORD_MIN = 12;

export async function POST(req: NextRequest) {
  const auth = await requireApiOperator({ allowPasswordChange: true });
  if (auth.denied) return auth.denied;

  const body = await req.json().catch(() => ({}));
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");

  const row = await getOperatorRow(auth.op.id);
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    return NextResponse.json({ error: "Your current password isn't right." }, { status: 400 });
  }
  if (next.length < OPERATOR_PASSWORD_MIN) {
    return NextResponse.json({ error: `Use at least ${OPERATOR_PASSWORD_MIN} characters.` }, { status: 400 });
  }
  if (next.length > 200) return NextResponse.json({ error: "That password is too long." }, { status: 400 });
  if (next === current) {
    return NextResponse.json({ error: "Choose a password different from the current one." }, { status: 400 });
  }

  await setOperatorPassword(auth.op.id, await hashPassword(next), false);
  await deleteOperatorSessions(auth.op.id, await currentOperatorTokenHash());
  await recordAudit(null, { id: auth.op.id, name: auth.op.name }, "operator_password_change", "operator", auth.op.id);
  return NextResponse.json({ ok: true, redirect: "/platform" });
}
