import { NextResponse } from "next/server";
import { deleteOperatorSession, recordAudit } from "@/lib/db";
import { currentOperatorTokenHash, getCurrentOperator } from "@/lib/platform";
import { OPERATOR_COOKIE } from "@/lib/session-cookie";

export async function POST() {
  const op = await getCurrentOperator();
  const tokenHash = await currentOperatorTokenHash();
  if (tokenHash) await deleteOperatorSession(tokenHash);
  if (op) await recordAudit(null, { id: op.id, name: op.name }, "operator_logout", "operator", op.id);

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: OPERATOR_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
