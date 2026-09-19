import { NextRequest, NextResponse } from "next/server";
import {
  billsPaidOn,
  createBill,
  getPatient,
  localDay,
  owedTotal,
  payBill,
  recordAudit,
  takingsOn,
  unpaidBills,
} from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { cleanItems, formatPaise, parseMethod, totalOf } from "@/lib/money";

/** The bills desk: what is owed, what was paid today and what was collected.
 *  Names and amounts only — nothing clinical. */
export async function GET() {
  const auth = await requireApiUser("billing");
  if (auth.denied) return auth.denied;
  const { clinicId } = auth.user;
  const today = localDay();
  return NextResponse.json({
    day: today,
    unpaid: await unpaidBills(clinicId),
    paidToday: await billsPaidOn(clinicId, today),
    takings: await takingsOn(clinicId, today),
    owed: await owedTotal(clinicId),
  });
}

/**
 * Make a bill: the patient, the lines as the desk typed them, amounts in
 * paise. With `pay` set to a method, it is paid at once and gets its receipt
 * number; without, it waits on the list of bills still owed.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("billing");
  if (auth.denied) return auth.denied;
  const { user } = auth;

  const body = await req.json().catch(() => ({}));
  const patient = await getPatient(user.clinicId, String(body.patientId ?? ""));
  if (!patient) return NextResponse.json({ error: "That patient isn't on file." }, { status: 404 });

  const cleaned = cleanItems(body.items);
  if ("error" in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  if (totalOf(cleaned.items) === 0) return NextResponse.json({ error: "The bill comes to ₹0. Enter the amounts." }, { status: 400 });
  const method = body.pay == null || body.pay === "" ? null : parseMethod(body.pay);
  if (body.pay && !method) return NextResponse.json({ error: "Choose how it was paid: cash, UPI, card or other." }, { status: 400 });

  const bill = await createBill(user.clinicId, patient.id, cleaned.items, user.id);
  const lines = `${cleaned.items.length} line${cleaned.items.length === 1 ? "" : "s"}`;
  await recordAudit(user.clinicId, user, "bill_create", "bill", bill.id, `${formatPaise(bill.totalPaise)}, ${lines}`);

  if (!method) return NextResponse.json({ bill });
  const paid = await payBill(user.clinicId, bill.id, method, user.id);
  if (paid?.state !== "paid") return NextResponse.json({ error: "The bill was made but the payment could not be recorded." }, { status: 500 });
  await recordAudit(user.clinicId, user, "bill_pay", "bill", bill.id, `receipt ${paid.bill.receiptNo}, ${formatPaise(bill.totalPaise)}, ${method}`);
  return NextResponse.json({ bill: paid.bill });
}
