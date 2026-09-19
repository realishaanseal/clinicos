import { NextRequest, NextResponse } from "next/server";
import { getBill, recordAudit, voidBill } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { formatPaise } from "@/lib/money";
import { cleanText } from "@/lib/users";

/**
 * Cancel a bill. Only someone who manages the clinic may, with a reason, and
 * only after typing CANCEL: money may already have changed hands, and the
 * receipt is in the patient's pocket. The bill stays on record, marked
 * cancelled; it is never deleted.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const { user } = auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  if (String(body.confirm ?? "").trim() !== "CANCEL") {
    return NextResponse.json({ error: "Type CANCEL to confirm." }, { status: 400 });
  }
  const reason = cleanText(body.reason, 200);
  if (!reason) return NextResponse.json({ error: "Say why the bill is being cancelled." }, { status: 400 });

  const bill = await getBill(user.clinicId, id);
  if (!bill) return NextResponse.json({ error: "That bill isn't on file." }, { status: 404 });
  if (!(await voidBill(user.clinicId, id, user.id, reason))) {
    return NextResponse.json({ error: "That bill was already cancelled." }, { status: 409 });
  }
  // The reason stays on the bill, not in the log: it is typed freely and could
  // name the patient, and a deleted record must not survive in the log.
  await recordAudit(
    user.clinicId, user, "bill_void", "bill", id,
    `${bill.receiptNo ? `receipt ${bill.receiptNo}` : "unpaid bill"}, ${formatPaise(bill.totalPaise)}`
  );
  return NextResponse.json({ bill: await getBill(user.clinicId, id) });
}
