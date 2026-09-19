/**
 * The medicine timing card (backlog #9): each medicine on the prescription, with
 * when to take it — morning, afternoon, night — before or after food, and for
 * how long, in the patient's language, with pictures for those who read little.
 *
 * It only re-reads what the doctor wrote. Nothing is decided here: a frequency
 * this file does not recognise with certainty is printed exactly as written,
 * with no pictures, rather than guessed. "OD" (once a day) gets no time of day,
 * because the doctor did not say which. That line is invariant 1.
 *
 * Pure functions; the prescription (a client component) uses them.
 */
import type { Medication } from "./types";

export type CardLanguage = "en" | "bn" | "hi";
export const CARD_LANGUAGES: Record<CardLanguage, string> = { en: "English", bn: "বাংলা (Bengali)", hi: "हिन्दी (Hindi)" };

export function parseCardLanguage(v: unknown): CardLanguage | null {
  return v === "en" || v === "bn" || v === "hi" ? v : null;
}

type Words = {
  title: string;
  morning: string;
  afternoon: string;
  night: string;
  afterFood: string;
  beforeFood: string;
  emptyStomach: string;
  whenNeeded: string;
  onceADay: string;
  fourTimes: string;
  atOnce: string;
  day: (n: string) => string;
  week: (n: string) => string;
  month: (n: string) => string;
  digits: (s: string) => string;
};

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
// Hindi prescriptions are usually numbered in Western digits; kept as they are.
const WORDS: Record<CardLanguage, Words> = {
  en: {
    title: "When to take your medicines",
    morning: "Morning", afternoon: "Afternoon", night: "Night",
    afterFood: "After food", beforeFood: "Before food", emptyStomach: "Empty stomach",
    whenNeeded: "Only when needed", onceADay: "Once a day", fourTimes: "4 times a day", atOnce: "At once",
    day: (n) => `${n} day${n === "1" ? "" : "s"}`, week: (n) => `${n} week${n === "1" ? "" : "s"}`, month: (n) => `${n} month${n === "1" ? "" : "s"}`,
    digits: (s) => s,
  },
  bn: {
    title: "কখন ওষুধ খাবেন",
    morning: "সকাল", afternoon: "দুপুর", night: "রাত",
    afterFood: "খাবার পরে", beforeFood: "খাবার আগে", emptyStomach: "খালি পেটে",
    whenNeeded: "দরকার হলে তবেই", onceADay: "দিনে একবার", fourTimes: "দিনে চারবার", atOnce: "এখনই",
    day: (n) => `${n} দিন`, week: (n) => `${n} সপ্তাহ`, month: (n) => `${n} মাস`,
    digits: (s) => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]),
  },
  hi: {
    title: "दवा कब लेनी है",
    morning: "सुबह", afternoon: "दोपहर", night: "रात",
    afterFood: "खाने के बाद", beforeFood: "खाने से पहले", emptyStomach: "खाली पेट",
    whenNeeded: "ज़रूरत होने पर ही", onceADay: "दिन में एक बार", fourTimes: "दिन में चार बार", atOnce: "अभी",
    day: (n) => `${n} दिन`, week: (n) => `${n} सप्ताह`, month: (n) => `${n} महीना`,
    digits: (s) => s,
  },
};

export type Slots = { morning: number; afternoon: number; night: number };

export type CardRow = {
  name: string;
  /** Doses at each time of day, or null when the doctor's wording is kept as written. */
  slots: Slots | null;
  /** In the card's language when recognised; otherwise the doctor's own words. */
  when: string;
  food: string;
  duration: string;
};

/**
 * Times of day from the doctor's frequency, only where the notation says them
 * outright: "1-0-1" style (morning-afternoon-night, as written in India), and
 * BD, TDS, HS and their spelled-out forms, whose meaning in Indian practice is
 * fixed. Everything else is left to the words.
 */
export function readFrequency(freq: string): { slots: Slots | null; kind: keyof Words | null } {
  const f = freq.trim().toLowerCase().replace(/\s+/g, " ");
  if (!f) return { slots: null, kind: null };

  const pattern = /^(\d+(?:\.\d+)?|½)\s*[-–—x×]\s*(\d+(?:\.\d+)?|½)\s*[-–—x×]\s*(\d+(?:\.\d+)?|½)$/.exec(f.replace(/\s/g, ""));
  if (pattern) {
    const n = (s: string) => (s === "½" ? 0.5 : Number(s));
    return { slots: { morning: n(pattern[1]), afternoon: n(pattern[2]), night: n(pattern[3]) }, kind: null };
  }
  const is = (...forms: string[]) => forms.includes(f.replace(/[.\s]/g, ""));
  if (is("bd", "bid", "twiceaday", "twicedaily", "2times", "2timesaday")) return { slots: { morning: 1, afternoon: 0, night: 1 }, kind: null };
  if (is("tds", "tid", "thriceaday", "thricedaily", "3times", "3timesaday")) return { slots: { morning: 1, afternoon: 1, night: 1 }, kind: null };
  if (is("hs", "atbedtime", "bedtime", "atnight", "night", "nightly")) return { slots: { morning: 0, afternoon: 0, night: 1 }, kind: null };
  if (is("od", "qd", "onceaday", "oncedaily", "daily")) return { slots: null, kind: "onceADay" };
  if (is("qid", "qds", "4times", "4timesaday", "fourtimesaday")) return { slots: null, kind: "fourTimes" };
  if (is("sos", "prn", "asneeded", "whenneeded", "whenrequired", "ifneeded")) return { slots: null, kind: "whenNeeded" };
  if (is("stat", "immediately", "atonce")) return { slots: null, kind: "atOnce" };
  return { slots: null, kind: null };
}

function readFood(instructions: string): "afterFood" | "beforeFood" | "emptyStomach" | null {
  const t = instructions.toLowerCase();
  if (/empty stomach|khali pet|খালি পেট/.test(t)) return "emptyStomach";
  if (/\bafter (food|meals?|eating)\b|\bpc\b|খাবার পরে|खाने के बाद/.test(t)) return "afterFood";
  if (/\bbefore (food|meals?|eating)\b|\bac\b|খাবার আগে|खाने से पहले/.test(t)) return "beforeFood";
  return null;
}

function readDuration(duration: string, w: Words): string {
  const m = /^\s*(\d+)\s*(d|days?|w|wks?|weeks?|m|mths?|months?)\s*$/i.exec(duration);
  if (!m) return duration.trim();
  const n = w.digits(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith("d")) return w.day(n);
  if (unit.startsWith("w")) return w.week(n);
  return w.month(n);
}

export function cardRows(medications: Medication[], lang: CardLanguage): CardRow[] {
  const w = WORDS[lang];
  return medications
    .filter((m) => m.name.trim())
    .map((m) => {
      const { slots, kind } = readFrequency(m.frequency);
      const food = readFood(m.instructions);
      return {
        name: [m.name, m.dose].filter(Boolean).join(" "),
        slots,
        when: kind ? (w[kind] as string) : slots ? "" : m.frequency.trim(),
        food: food ? w[food] : "",
        duration: readDuration(m.duration, w),
      };
    });
}

export function cardWords(lang: CardLanguage) {
  const w = WORDS[lang];
  return { title: w.title, morning: w.morning, afternoon: w.afternoon, night: w.night, digits: w.digits };
}
