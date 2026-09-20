/**
 * The day in one message, for whoever owns the clinic (backlog #13).
 *
 * Counts and money only: how many were seen, what was collected and how, what
 * is still owed, and how many are asked back tomorrow. Never a patient's name,
 * never anything clinical — it is sent over WhatsApp, to a phone that other
 * people pick up.
 *
 * ClinicOS sends nothing itself: the desk taps a wa.me link and presses send,
 * exactly as for a follow-up reminder (recall.ts).
 *
 * No Node imports.
 */
import { METHOD_LABEL, formatPaise, type PayMethod } from "./money";
import { dayLabel } from "./recall";

export type DaySummary = {
  clinicName: string;
  /** The clinic's day, YYYY-MM-DD. */
  day: string;
  seen: number;
  waiting: number;
  collected: { total: number; count: number; byMethod: Record<string, number> };
  owed: { total: number; count: number };
  followUpsTomorrow: number;
};

export function daySummaryText(s: DaySummary): string {
  const methods = Object.entries(s.collected.byMethod)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${METHOD_LABEL[k as PayMethod] ?? k} ${formatPaise(v)}`)
    .join(" · ");
  return [
    `${s.clinicName} · ${dayLabel(s.day, { weekday: "short", day: "numeric", month: "short" })}`,
    `Patients seen: ${s.seen}${s.waiting ? ` (${s.waiting} still waiting)` : ""}`,
    `Collected: ${formatPaise(s.collected.total)}${methods ? ` — ${methods}` : ""}`,
    `Still owed: ${formatPaise(s.owed.total)}${s.owed.count ? ` on ${s.owed.count} bill${s.owed.count === 1 ? "" : "s"}` : ""}`,
    `Follow-ups due tomorrow: ${s.followUpsTomorrow}`,
    "",
    "Sent from ClinicOS",
  ].join("\n");
}
