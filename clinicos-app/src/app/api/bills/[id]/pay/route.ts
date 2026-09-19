import { NextRequest, NextResponse } from "next/server";
import { payBill, recordAudit } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { formatPaise, parseMethod } from "@/lib/money";

/** Take payment for a bill made earlier: it gets its receipt number now. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("billing");
  if (auth.denied) return auth.denied;
  const { user } = auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const method = parseMethod(body.method);
  if (!method) return NextResponse.json({ error: "Choose how it was paid: cash, UPI, card or other." }, { status: 400 });

  const out = await payBill(user.clinicId, id, method, user.id);
  if (!out) return NextResponse.json({ error: "That bill isn't on file." }, { status: 404 });
  if (out.state === "cancelled") return NextResponse.json({ error: "That bill was cancelled." }, { status: 409 });
  if (out.state === "already") {
    return NextResponse.json({ error: `That bill is already paid: receipt ${out.bill.receiptNo}.`, bill: out.bill }, { status: 409 });
  }
  await recordAudit(user.clinicId, user, "bill_pay", "bill", id, `receipt ${out.bill.receiptNo}, ${formatPaise(out.bill.totalPaise)}, ${method}`);
  return NextResponse.json({ bill: out.bill });
}
