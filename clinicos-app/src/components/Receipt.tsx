import type { BillRow } from "@/lib/db";
import { METHOD_LABEL, formatPaise, type PayMethod } from "@/lib/money";
import { fmt, fmtDate } from "@/lib/time";
import { Mark } from "./Icons";

/**
 * A printed receipt, or a bill not yet paid. Half a page: the clinic, the
 * number, who paid, for what, how much and how. Nothing clinical — no
 * diagnosis, no medicine, no doctor's note — because a receipt is shown to
 * employers and insurers and left on counters.
 */
export default function Receipt({
  bill,
  clinic,
}: {
  bill: BillRow;
  clinic: { name: string; address: string; phone: string; logo: string };
}) {
  const items = JSON.parse(bill.itemsJson) as { label: string; amount: number }[];
  const paid = !!bill.paidAt;
  const cancelled = !!bill.voidedAt;
  const when = new Date(bill.paidAt ?? bill.createdAt);

  return (
    <div className="rcpt-wrap">
      <div className="rcpt">
        {cancelled && (
          <div className="rcpt-void" aria-hidden>
            Cancelled
          </div>
        )}
        <header className="rcpt-head">
          {clinic.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URL checked when it was uploaded
            <img className="rx-logo" src={clinic.logo} alt={`${clinic.name} logo`} />
          ) : (
            <span className="rx-mark">
              <Mark size={20} />
            </span>
          )}
          <div>
            <div className="rcpt-clinic">{clinic.name}</div>
            <div className="rcpt-addr">
              {[clinic.address, clinic.phone].filter(Boolean).join(" · ")}
            </div>
          </div>
        </header>

        <div className="rcpt-title">
          <span>{paid ? "Receipt" : "Bill — not paid yet"}</span>
          {paid && <span className="mono">No. {bill.receiptNo}</span>}
        </div>

        <dl className="rcpt-meta">
          <div>
            <dt>{paid ? "Received from" : "Patient"}</dt>
            <dd>{bill.patientName}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{fmtDate(when, { day: "2-digit", month: "short", year: "numeric" })}</dd>
          </div>
        </dl>

        <table className="rcpt-items">
          <thead>
            <tr>
              <th>Description</th>
              <th className="amt">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={n}>
                <td>{i.label}</td>
                <td className="amt">{formatPaise(i.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="amt">{formatPaise(bill.totalPaise)}</td>
            </tr>
          </tfoot>
        </table>

        {paid ? (
          <p className="rcpt-paid">
            Paid by <strong>{METHOD_LABEL[bill.method as PayMethod] ?? bill.method}</strong>
            {bill.receivedByName && <> · received by {bill.receivedByName}</>}
          </p>
        ) : (
          <p className="rcpt-paid">To be paid at the desk.</p>
        )}
        {cancelled && (
          <p className="rcpt-paid">
            Cancelled {fmtDate(new Date(bill.voidedAt!), { day: "2-digit", month: "short", year: "numeric" })}
            {bill.voidReason && <>: {bill.voidReason}</>}
          </p>
        )}

        <footer className="rcpt-foot">
          <span>Thank you.</span>
          <span className="mono">
            {bill.id.slice(-8).toUpperCase()} · {fmt(when, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </footer>
      </div>
    </div>
  );
}
