import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getBill } from "@/lib/db";
import { getClinic } from "@/lib/clinic";
import Receipt from "@/components/Receipt";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/** One bill: its printable receipt, or the bill itself while unpaid. */
export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("billing");
  const { id } = await params;
  const bill = await getBill(user.clinicId, id);
  if (!bill) notFound();
  const clinic = await getClinic(user.clinicId);

  return (
    <div className="page">
      <div className="page-head noprint">
        <div className="eyebrow">{bill.paidAt ? "Receipt" : "Bill"}</div>
        <h1>{bill.patientName}</h1>
        <div className="btnrow" style={{ marginTop: 12 }}>
          <PrintButton label={bill.paidAt ? "Print receipt" : "Print bill"} />
          <Link href="/bills" className="muted">
            ← Back to bills
          </Link>
        </div>
      </div>
      <Receipt bill={bill} clinic={clinic} />
    </div>
  );
}
