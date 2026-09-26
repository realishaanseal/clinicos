import { can, requireUser } from "@/lib/auth";
import { billsPaidOn, getPatient, localDay, owedTotal, takingsOn, unpaidBills } from "@/lib/db";
import { getBillingSettings } from "@/lib/clinic";
import { fmtDate } from "@/lib/time";
import BillsDesk from "@/components/BillsDesk";

export const dynamic = "force-dynamic";

/** Bills and receipts (backlog #12). Opened from the nav, or from a patient's
 *  row on the day's list with ?patient=, which starts their bill. */
export default async function BillsPage({ searchParams }: { searchParams: Promise<{ patient?: string }> }) {
  const user = await requireUser("billing");
  const today = localDay();
  const { patient: patientId } = await searchParams;
  const [p, unpaid, paidToday, takings, owed, billing] = await Promise.all([
    patientId ? getPatient(user.clinicId, patientId) : undefined,
    unpaidBills(user.clinicId),
    billsPaidOn(user.clinicId, today),
    takingsOn(user.clinicId, today),
    owedTotal(user.clinicId),
    getBillingSettings(user.clinicId),
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">{fmtDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1>Bills</h1>
        <p className="sub">Make a bill, take payment and print a receipt.</p>
      </div>
      <BillsDesk
        unpaid={unpaid}
        paidToday={paidToday}
        takings={takings}
        owed={owed}
        feePaise={billing.feePaise}
        preselect={p ? { id: p.id, name: p.name, age: p.age, sex: p.sex, phone: p.phone } : null}
        canCancel={can(user, "admin")}
      />
    </div>
  );
}
