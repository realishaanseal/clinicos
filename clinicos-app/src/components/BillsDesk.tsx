"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BillRow, DayTakings } from "@/lib/db";
import { METHODS, METHOD_LABEL, formatPaise, paiseToInput, rupeesToPaise, type PayMethod } from "@/lib/money";
import { appPath } from "@/lib/base-path";
import { fmtDate, fmtTime } from "@/lib/time";
import { IcAlert, IcCheck, IcPlus, IcPrint, IcTrash } from "./Icons";

type Person = { id: string; name: string; age: number | null; sex: string | null; phone: string | null };
type Line = { label: string; amount: string };

const itemsOf = (b: BillRow) => JSON.parse(b.itemsJson) as { label: string; amount: number }[];
const who = (p: { age: number | null; sex: string | null; phone: string | null }) =>
  [p.age !== null ? `${p.age}` : null, p.sex, p.phone].filter(Boolean).join(" · ");

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
  return data;
}

/**
 * The bills desk (backlog #12): make a bill, take payment, print a receipt.
 * Only what the desk types — "Consultation", "Dressing" — and amounts. Nothing
 * clinical appears here, because whoever takes the money reads it.
 */
export default function BillsDesk({
  unpaid,
  paidToday,
  takings,
  owed,
  feePaise,
  preselect,
  canCancel,
}: {
  unpaid: BillRow[];
  paidToday: BillRow[];
  takings: DayTakings;
  owed: { total: number; count: number };
  feePaise: number | null;
  preselect: Person | null;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState<{ text: string; billId: string; paid: boolean } | null>(null);
  const [cancelling, setCancelling] = useState<BillRow | null>(null);

  const methods = Object.entries(takings.byMethod)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${METHOD_LABEL[k as PayMethod] ?? k} ${formatPaise(v)}`);

  function finished(text: string, billId: string, paid: boolean) {
    setDone({ text, billId, paid });
    router.refresh();
  }

  return (
    <>
      <div className="stats">
        <div className="stat hero">
          <div className="k">Collected today</div>
          <div className="v">{formatPaise(takings.total)}</div>
          <div className="n">{methods.length ? methods.join(" · ") : "nothing yet"}</div>
        </div>
        <div className="stat">
          <div className="k">Still owed</div>
          <div className="v">{formatPaise(owed.total)}</div>
          <div className="n">{owed.count} unpaid bill{owed.count === 1 ? "" : "s"}</div>
        </div>
        <div className="stat">
          <div className="k">Receipts today</div>
          <div className="v">{takings.count}</div>
          <div className="n">not counting cancelled</div>
        </div>
      </div>

      {done && (
        <div className="note ok" role="status">
          <IcCheck size={17} />
          <span>
            {done.text}{" "}
            <Link href={`/bills/${done.billId}`}>{done.paid ? "Print the receipt →" : "Print the bill →"}</Link>
          </span>
        </div>
      )}

      <NewBill key={preselect?.id ?? "new"} feePaise={feePaise} preselect={preselect} onDone={finished} />

      <BillTable
        title="Not paid yet"
        empty="Every bill is paid."
        rows={unpaid}
        unpaid
        canCancel={canCancel}
        onPaid={finished}
        onCancel={setCancelling}
      />
      <BillTable
        title="Paid today"
        empty="No payments taken today yet."
        rows={paidToday}
        canCancel={canCancel}
        onPaid={finished}
        onCancel={setCancelling}
      />

      {cancelling && (
        <CancelDialog
          bill={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={() => {
            setCancelling(null);
            setDone(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function NewBill({
  feePaise,
  preselect,
  onDone,
}: {
  feePaise: number | null;
  preselect: Person | null;
  onDone: (text: string, billId: string, paid: boolean) => void;
}) {
  const [patient, setPatient] = useState<Person | null>(preselect);
  const firstLine = (): Line => ({ label: "Consultation", amount: feePaise ? paiseToInput(feePaise) : "" });
  const [lines, setLines] = useState<Line[]>([firstLine()]);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amounts = lines.map((l) => (l.amount.trim() ? rupeesToPaise(l.amount) : 0));
  const total = amounts.reduce<number>((s, a) => s + (a ?? 0), 0);
  const unreadable = lines.findIndex((l, i) => l.amount.trim() && amounts[i] === null);

  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save(pay: PayMethod | null) {
    if (!patient) return;
    if (unreadable >= 0) {
      setError(`“${lines[unreadable].amount}” isn't an amount in rupees.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await post(appPath("/api/bills"), {
        patientId: patient.id,
        items: lines.map((l, i) => ({ label: l.label, amount: amounts[i] ?? 0 })),
        pay,
      });
      const b = data.bill as BillRow;
      onDone(
        pay
          ? `Receipt ${b.receiptNo}: ${formatPaise(b.totalPaise)} from ${patient.name}, by ${METHOD_LABEL[pay]}.`
          : `Bill of ${formatPaise(b.totalPaise)} for ${patient.name} is waiting to be paid.`,
        b.id,
        !!pay
      );
      setPatient(null);
      setLines([firstLine()]);
      setMethod("cash");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">New bill</span>
        <span className="muted">what the patient pays, nothing clinical</span>
      </div>
      <div className="card-body">
        {error && (
          <div className="note err" role="alert">
            <IcAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {patient ? (
          <div className="bill-who">
            <div>
              <strong>{patient.name}</strong>
              <span className="dim" style={{ marginLeft: 8, fontSize: 13 }}>{who(patient)}</span>
            </div>
            <button type="button" className="quiet small" onClick={() => setPatient(null)} disabled={busy}>
              Change patient
            </button>
          </div>
        ) : (
          <FindForBill onPick={setPatient} />
        )}

        {patient && (
          <>
            <div className="bill-lines" role="group" aria-label="Lines on the bill">
              <div className="bill-line hd">
                <span>Description</span>
                <span>Amount (₹)</span>
                <span />
              </div>
              {lines.map((l, i) => (
                <div className="bill-line" key={i}>
                  <input
                    aria-label={`Line ${i + 1}: description`}
                    value={l.label}
                    onChange={(e) => setLine(i, { label: e.target.value })}
                    placeholder="e.g. Dressing"
                    maxLength={80}
                  />
                  <input
                    aria-label={`Line ${i + 1}: amount in rupees`}
                    value={l.amount}
                    onChange={(e) => setLine(i, { amount: e.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                    className={l.amount.trim() && amounts[i] === null ? "bad" : ""}
                  />
                  <button
                    type="button"
                    className="iconbtn"
                    title="Remove this line"
                    onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : [{ label: "", amount: "" }])}
                  >
                    <IcTrash size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="btnrow" style={{ marginTop: 10, justifyContent: "space-between" }}>
              <button type="button" className="ghost small" onClick={() => setLines([...lines, { label: "", amount: "" }])}>
                <IcPlus size={14} /> Add a line
              </button>
              <span className="bill-total">
                Total <strong>{formatPaise(total)}</strong>
              </span>
            </div>
            {!feePaise && (
              <p className="hint">Clinic admin can set the consultation fee, so it fills in by itself.</p>
            )}

            <div className="bill-pay">
              <label htmlFor="bill-method">Paid now by</label>
              <div className="btnrow">
                <select id="bill-method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} disabled={busy} style={{ maxWidth: 160 }}>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                  ))}
                </select>
                <button type="button" onClick={() => save(method)} disabled={busy || total <= 0}>
                  <IcCheck size={16} /> {busy ? "Saving…" : `Paid ${formatPaise(total)}`}
                </button>
                <button type="button" className="ghost" onClick={() => save(null)} disabled={busy || total <= 0}>
                  Pay later
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FindForBill({ onPick }: { onPick: (p: Person) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Person[] | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setFound(null);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(appPath(`/api/bills/patients?q=${encodeURIComponent(term)}`), { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Search failed");
        setFound(data.patients);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 250);
  }, [q]);

  return (
    <div>
      <label htmlFor="bill-search">Patient — name or phone number</label>
      <input
        id="bill-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="e.g. Rina Das, or 98300 12345"
        autoComplete="off"
      />
      {error && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}
      {found && (
        <div className="results bill-results" aria-live="polite">
          {found.length === 0 ? (
            <div className="result-row">
              <span className="muted">Nobody on file matches. Register them first, from Today.</span>
            </div>
          ) : (
            found.slice(0, 8).map((p) => (
              <div className="result-row" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <span className="dim" style={{ marginLeft: 8, fontSize: 13 }}>{who(p)}</span>
                </div>
                <button type="button" className="ghost small" onClick={() => onPick(p)}>
                  Bill<span className="visually-hidden"> {p.name}</span>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BillTable({
  title,
  empty,
  rows,
  unpaid = false,
  canCancel,
  onPaid,
  onCancel,
}: {
  title: string;
  empty: string;
  rows: BillRow[];
  unpaid?: boolean;
  canCancel: boolean;
  onPaid: (text: string, billId: string, paid: boolean) => void;
  onCancel: (b: BillRow) => void;
}) {
  const [paying, setPaying] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay(b: BillRow, method: PayMethod) {
    setBusy(true);
    setError("");
    try {
      const data = await post(appPath(`/api/bills/${b.id}/pay`), { method });
      setPaying(null);
      onPaid(`Receipt ${data.bill.receiptNo}: ${formatPaise(b.totalPaise)} from ${b.patientName}, by ${METHOD_LABEL[method]}.`, b.id, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">{title}</span>
        {rows.length > 0 && <span className="muted">{rows.length}</span>}
      </div>
      {error && (
        <div className="note err" role="alert" style={{ margin: "12px 20px" }}>
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="card-body">
          <p className="muted" style={{ margin: 0 }}>{empty}</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="queue bills">
            <thead>
              <tr>
                <th>{unpaid ? "Made" : "Receipt"}</th>
                <th>Patient</th>
                <th>For</th>
                <th className="num">Amount</th>
                <th><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const items = itemsOf(b);
                const cancelled = !!b.voidedAt;
                return (
                  <tr key={b.id} className={cancelled ? "finished" : ""}>
                    <td className="nowrap">
                      {unpaid ? (
                        <span className="dim" suppressHydrationWarning>{fmtDate(new Date(b.createdAt), { day: "numeric", month: "short" })}</span>
                      ) : (
                        <>
                          <span className="mono">{b.receiptNo}</span>
                          <div className="dim sub" suppressHydrationWarning>
                            {b.paidAt && fmtTime(new Date(b.paidAt), { hour: "numeric", minute: "2-digit" })} ·{" "}
                            {METHOD_LABEL[b.method as PayMethod] ?? b.method}
                          </div>
                        </>
                      )}
                    </td>
                    <td>
                      <span className="nm">{b.patientName}</span>
                      {b.receivedByName && !unpaid && <div className="dim sub">taken by {b.receivedByName}</div>}
                    </td>
                    <td className="dim">
                      {items.map((i) => i.label).join(", ")}
                      {cancelled && (
                        <div className="sub">
                          <span className="pill off">Cancelled</span>{" "}
                          {b.voidReason}
                        </div>
                      )}
                    </td>
                    <td className="num" style={{ fontWeight: 620, textDecoration: cancelled ? "line-through" : undefined }}>
                      {formatPaise(b.totalPaise)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row-actions">
                        {unpaid && paying === b.id ? (
                          <>
                            {METHODS.map((m) => (
                              <button key={m} type="button" className="small" onClick={() => pay(b, m)} disabled={busy}>
                                {METHOD_LABEL[m]}
                              </button>
                            ))}
                            <button type="button" className="quiet small" onClick={() => setPaying(null)} disabled={busy}>
                              Back
                            </button>
                          </>
                        ) : (
                          <>
                            {unpaid && (
                              <button type="button" className="ghost small" onClick={() => setPaying(b.id)} disabled={busy}>
                                Take payment<span className="visually-hidden"> from {b.patientName}</span>
                              </button>
                            )}
                            <Link href={`/bills/${b.id}`} className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <IcPrint size={14} /> {unpaid ? "Bill" : "Receipt"}
                            </Link>
                            {canCancel && !cancelled && (
                              <button type="button" className="quiet small" onClick={() => onCancel(b)} disabled={busy}>
                                Cancel bill<span className="visually-hidden"> for {b.patientName}</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Cancelling a bill is typed to confirm, like every irreversible action here. */
function CancelDialog({ bill, onClose, onCancelled }: { bill: BillRow; onClose: () => void; onCancelled: () => void }) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = typed.trim() === "CANCEL" && reason.trim().length > 0;

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await post(appPath(`/api/bills/${bill.id}/cancel`), { reason, confirm: typed.trim() });
      onCancelled();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cancel-bill-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" id="cancel-bill-title">
          <IcAlert size={18} /> Cancel this bill?
        </div>
        <div className="modal-bd">
          <p style={{ marginTop: 0 }}>
            {bill.receiptNo ? <>Receipt <strong>{bill.receiptNo}</strong>, </> : "An unpaid bill, "}
            <strong>{formatPaise(bill.totalPaise)}</strong> for {bill.patientName}. It stays on record marked cancelled, and
            stops counting towards what was collected or is owed.
            {bill.receiptNo && " If money was taken, give it back before cancelling."}
          </p>
          {error && (
            <div className="note err" role="alert">
              <IcAlert size={17} />
              <span>{error}</span>
            </div>
          )}
          <label htmlFor="cancel-reason">Why</label>
          <input
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Wrong amount, billed again"
            maxLength={200}
            autoFocus
          />
          <label htmlFor="cancel-typed" style={{ marginTop: 14 }}>
            Type <span className="typename">CANCEL</span> to confirm
          </label>
          <input
            id="cancel-typed"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="CANCEL"
            autoComplete="off"
            spellCheck={false}
            className={typed && typed.trim() !== "CANCEL" ? "bad" : typed.trim() === "CANCEL" ? "good" : ""}
          />
        </div>
        <div className="modal-ft">
          <button className="ghost" onClick={onClose} disabled={busy} type="button">
            Keep it
          </button>
          <button className="destroy" onClick={confirm} disabled={!ready || busy} type="button">
            {busy ? "Cancelling…" : "Cancel the bill"}
          </button>
        </div>
      </div>
    </div>
  );
}
