/**
 * The follow-up reminder the desk sends on WhatsApp (backlog #10).
 *
 * Nothing is sent by ClinicOS. The desk taps a wa.me link, WhatsApp opens on
 * their own phone or computer with the message typed in, and they press send
 * themselves: no WhatsApp account for the clinic, no API, no cost, and nothing
 * leaves ClinicOS except what the desk chooses to send.
 *
 * The message can say only who, where, which doctor and when — never why. The
 * template's placeholders are all there is: there is no way to put a diagnosis
 * into it, because a phone's lock screen shows the first line to anyone.
 *
 * No Node imports: the follow-up screen builds the links with this too.
 */
import { fmtDate } from "./time";

export const RECALL_PLACEHOLDERS = ["{name}", "{clinic}", "{doctor}", "{date}"] as const;

export const DEFAULT_RECALL_MESSAGE =
  "Hello {name}, this is {clinic}. {doctor} asked to see you again on {date}. Please come in, or reply to this message to fix a time.\n\n" +
  "নমস্কার {name}, {clinic} থেকে বলছি। {doctor} আপনাকে {date} তারিখে আবার দেখা করতে বলেছিলেন। দয়া করে আসুন, অথবা সময় ঠিক করতে এই মেসেজের উত্তর দিন।";

export const MAX_RECALL_MESSAGE = 700;

/** A clinic's day, YYYY-MM-DD, as "25 Sep". Read at midday so no time zone
 *  can move it to the day before. */
export function dayLabel(day: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return fmtDate(new Date(`${day}T12:00:00Z`), opts);
}

export function recallText(
  template: string,
  v: { name: string; clinic: string; doctor: string | null; date: string }
): string {
  const values: Record<string, string> = {
    "{name}": v.name,
    "{clinic}": v.clinic,
    "{doctor}": v.doctor || "The doctor",
    "{date}": dayLabel(v.date),
  };
  return (template.trim() || DEFAULT_RECALL_MESSAGE).replace(/\{(name|clinic|doctor|date)\}/g, (m) => values[m]);
}

/**
 * A phone number as wa.me wants it: country code and number, digits only. A
 * ten-digit number is taken to be Indian. Null for anything too short to be a
 * mobile number, rather than a link that opens WhatsApp on a stranger.
 */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
