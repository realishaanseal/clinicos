/**
 * The two sets of terms that replaced the consent screens (20 Sep 2026,
 * Ishaan's decision).
 *
 * Recording: the clinic accepts ClinicOS's terms once — at signup, or in Clinic
 * admin — and in them undertakes to tell every patient before recording and
 * not to record anyone who says no. The recording routes refuse until the
 * clinic has accepted this version (CLAUDE.md, invariant 5). The doctor no
 * longer reads a script before every visit.
 *
 * The patient portal: the patient accepts its terms once, in their own
 * language, the first time they sign in. The doctor no longer reads anything
 * out before sharing.
 *
 * Changing either text means changing its version, and everyone accepts again.
 *
 * No Node imports: the setup form and the portal show these.
 */

export const CLINIC_TERMS_VERSION = "2026-09-20";

export const CLINIC_TERMS: string[] = [
  "ClinicOS records a consultation only to write its note and prescription. The recording is deleted when the doctor signs, and is never used to train anything.",
  "Before recording, we tell each patient that the consultation is recorded and why, and that saying no changes nothing about their care. For a child, we ask their parent or guardian.",
  "We never record anyone who says no: we write the note by hand instead. A patient can ask us to stop at any time.",
  "The doctor reads and corrects every note before signing it. ClinicOS never diagnoses, scores or advises.",
  "These records are the clinic's: we can export all of them at any time, and Varaxis never opens them.",
];

/** What a doctor or the desk might say before recording, for anyone who wants
 *  the words. No longer a step: the clinic's terms say it must be said. */
export const WHAT_TO_SAY = {
  en: "The doctor is using a new system. Your conversation is recorded only to print your prescription; the doctor checks it and signs, and then the recording is deleted. Your details are never given to any medicine company. If you say no, the doctor sees you just the same. Say stop at any time and we stop. Do you agree?",
  bn: "ডাক্তারবাবু একটি নতুন ব্যবস্থা ব্যবহার করছেন। আপনার প্রেসক্রিপশন ছাপার জন্যই শুধু আপনাদের কথা রেকর্ড করা হয়; ডাক্তারবাবু দেখে সই করার পরেই রেকর্ডিংটি মুছে ফেলা হয়। আপনার তথ্য কোনো ওষুধ কোম্পানিকে দেওয়া হয় না। আপনি না বললেও ডাক্তারবাবু আপনাকে আগের মতোই দেখবেন। যে কোনো সময় 'বন্ধ করুন' বললে রেকর্ডিং বন্ধ হবে। আপনি কি রাজি আছেন?",
};

export type ClinicTerms = { version: string; at: string; byName: string };

export function parseClinicTerms(raw: string | undefined | null): ClinicTerms | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Partial<ClinicTerms>;
    return typeof t.version === "string" && typeof t.at === "string" ? { version: t.version, at: t.at, byName: String(t.byName ?? "") } : null;
  } catch {
    return null;
  }
}

/** Accepted, and the version that is in force now. */
export const termsInForce = (t: ClinicTerms | null) => !!t && t.version === CLINIC_TERMS_VERSION;

// ------------------------------------------------------------ the portal
export const LANGS = ["en", "bn", "hi"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAME: Record<Lang, string> = { en: "English", bn: "বাংলা", hi: "हिन्दी" };
export const LANG_COOKIE = "clinicos_lang";

export function parseLang(v: unknown): Lang | null {
  return LANGS.includes(v as Lang) ? (v as Lang) : null;
}

export const PATIENT_TERMS_VERSION = "2026-09-20";

export const PATIENT_TERMS: Record<Lang, { title: string; points: string[]; agree: string }> = {
  en: {
    title: "Before you start",
    points: [
      "Your clinic puts the prescriptions it shares with you here, so you can read them on your phone.",
      "Only someone with your phone number and your code or PIN can open them. Keep your PIN to yourself.",
      "They are kept encrypted and used for nothing else: no advertising, and nothing is sold.",
      "You can remove a prescription from your list, or delete your account, at any time. Your clinic keeps its own records, as the law requires.",
    ],
    agree: "I have read this and I agree",
  },
  bn: {
    title: "শুরু করার আগে",
    points: [
      "আপনার ক্লিনিক যে প্রেসক্রিপশন আপনাকে দেয়, তা এখানে রাখা হয়, যাতে আপনি নিজের ফোনে দেখতে পান।",
      "শুধু আপনার ফোন নম্বর আর কোড বা পিন দিয়েই এগুলি খোলা যায়। পিন কাউকে বলবেন না।",
      "এগুলি এনক্রিপ্ট করে রাখা হয়, অন্য কোনো কাজে ব্যবহার হয় না — কোনো বিজ্ঞাপন নয়, কিছু বিক্রি করা হয় না।",
      "যে কোনো সময় তালিকা থেকে প্রেসক্রিপশন সরাতে বা অ্যাকাউন্ট মুছে ফেলতে পারেন। ক্লিনিক আইন অনুযায়ী নিজের রেকর্ড রাখে।",
    ],
    agree: "আমি পড়েছি এবং আমি রাজি",
  },
  hi: {
    title: "शुरू करने से पहले",
    points: [
      "आपका क्लिनिक जो पर्चे आपके साथ साझा करता है, वे यहाँ रखे जाते हैं, ताकि आप उन्हें अपने फ़ोन पर देख सकें।",
      "सिर्फ़ आपके फ़ोन नंबर और कोड या पिन से ही इन्हें खोला जा सकता है। अपना पिन किसी को न बताएँ।",
      "इन्हें एन्क्रिप्ट करके रखा जाता है और किसी और काम में इस्तेमाल नहीं किया जाता — न विज्ञापन, न बिक्री।",
      "आप कभी भी कोई पर्चा अपनी सूची से हटा सकते हैं या अपना खाता मिटा सकते हैं। क्लिनिक क़ानून के अनुसार अपना रिकॉर्ड रखता है।",
    ],
    agree: "मैंने पढ़ लिया है और मैं सहमत हूँ",
  },
};
