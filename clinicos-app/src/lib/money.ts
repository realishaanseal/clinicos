/**
 * Money, for bills and receipts (backlog #12).
 *
 * Every amount is a whole number of paise. Rupees with a decimal point exist
 * only on screen: 0.1 + 0.2 is not 0.3 in floating point, and a clinic's day
 * of receipts must add up to exactly what is in the drawer.
 *
 * No Node imports: the bill screen formats amounts with this too.
 */

/** The most one line of a bill may be: ₹10 lakh. Anything larger is a typo. */
export const MAX_ITEM_PAISE = 1_000_000_00;
export const MAX_ITEMS = 20;

export type BillItem = { label: string; amount: number };

export const METHODS = ["cash", "upi", "card", "other"] as const;
export type PayMethod = (typeof METHODS)[number];

export const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  other: "Other",
};

export function parseMethod(v: unknown): PayMethod | null {
  return METHODS.includes(v as PayMethod) ? (v as PayMethod) : null;
}

/**
 * "300", "₹ 1,250.50", "1250.5" → paise. Null for anything that is not a
 * plain amount of rupees: negative, more than two decimal places, or words.
 */
export function rupeesToPaise(input: unknown): number | null {
  if (typeof input === "number") input = String(input);
  if (typeof input !== "string") return null;
  const s = input.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** Paise → "₹1,250" or "₹1,250.50", grouped the Indian way (₹1,00,000). */
export function formatPaise(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const rest = Math.abs(paise) % 100;
  const grouped = rupees.toLocaleString("en-IN");
  return `${paise < 0 ? "−" : ""}₹${grouped}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}

/** Paise → the plain number typed into a box: "1250", "1250.50". */
export function paiseToInput(paise: number): string {
  const rest = paise % 100;
  return `${Math.floor(paise / 100)}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}

/**
 * The lines of a bill as the browser sent them, checked: each a short label
 * and an amount in paise, nothing else. Lines with neither are dropped (a
 * blank row left on the form); a line with only one of the two is an error.
 */
export function cleanItems(raw: unknown): { items: BillItem[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "The bill has no lines." };
  const items: BillItem[] = [];
  for (const r of raw) {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const label = String(o.label ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const amount = typeof o.amount === "number" && Number.isInteger(o.amount) ? o.amount : null;
    if (!label && (amount === null || amount === 0)) continue;
    if (!label) return { error: "Every line needs a description, such as “Consultation”." };
    if (amount === null || amount < 0) return { error: `Enter an amount for “${label}”.` };
    if (amount > MAX_ITEM_PAISE) return { error: `The amount for “${label}” is too large. Check it.` };
    items.push({ label, amount });
  }
  if (!items.length) return { error: "Add at least one line, such as “Consultation”." };
  if (items.length > MAX_ITEMS) return { error: `A bill can have at most ${MAX_ITEMS} lines.` };
  return { items };
}

export const totalOf = (items: BillItem[]) => items.reduce((sum, i) => sum + i.amount, 0);
