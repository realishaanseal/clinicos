/**
 * Every word of the patient portal, in English, Bengali and Hindi. The patient
 * picks their language on the first screen; it is kept in a cookie, and on
 * their account once they have one.
 *
 * The prescription itself is shown as the doctor wrote and signed it: its words
 * are the doctor's, not ClinicOS's to translate.
 *
 * Errors from the server carry a short code, looked up here, so they reach the
 * patient in their language too; the English text is only the fallback.
 *
 * No Node imports.
 */
import type { Lang } from "./terms";

export type PortalWords = {
  brandTag: string;
  chooseLanguage: string;
  language: string;
  title: string;
  sub: string;
  foot: string;
  phone: string;
  code: string;
  choosePin: string;
  pin: string;
  pinAgain: string;
  open: string;
  setPin: string;
  opening: string;
  useCode: string;
  havePin: string;
  notAvailableTitle: string;
  notAvailable: string;
  countSub: (n: number) => string;
  nothingShared: string;
  emptyBig: string;
  emptyText: string;
  forName: (name: string) => string;
  signOut: string;
  deleteAsk: string;
  deleteTitle: string;
  deleteText: string;
  typeDelete: string;
  cancel: string;
  back: string;
  print: string;
  removeAsk: string;
  removeConfirm: string;
  remove: string;
  errors: Record<string, string>;
};

const en: PortalWords = {
  brandTag: "Prescriptions online",
  chooseLanguage: "Choose your language",
  language: "Language",
  title: "Your prescriptions",
  sub: "See the prescriptions your doctor shared with you.",
  foot: "Only you, with your phone number and your code or PIN, can open these.",
  phone: "Phone number",
  code: "Code on your prescription",
  choosePin: "Choose a 6-digit PIN",
  pin: "PIN",
  pinAgain: "The same PIN again",
  open: "Open my prescriptions",
  setPin: "Set PIN and open",
  opening: "Opening…",
  useCode: "First time here, or forgot your PIN? Use the code on your prescription",
  havePin: "I have a PIN already",
  notAvailableTitle: "Not available yet",
  notAvailable: "Prescriptions online are not switched on here yet. Ask your clinic.",
  countSub: (n) => `${n} prescription${n === 1 ? "" : "s"} shared with you, newest first.`,
  nothingShared: "Nothing shared with you right now.",
  emptyBig: "No prescriptions here",
  emptyText: "When a doctor shares one with you, it appears here.",
  forName: (name) => `For ${name}`,
  signOut: "Sign out",
  deleteAsk: "Delete my account…",
  deleteTitle: "Delete my account",
  deleteText:
    "Your PIN goes, and every prescription leaves this list. Your clinics keep their own records, as the law requires. A code from a prescription can start a new account later.",
  typeDelete: "Type DELETE to confirm",
  cancel: "Cancel",
  back: "← Your prescriptions",
  print: "Print",
  removeAsk: "Remove from my list",
  removeConfirm: "Take this out of your list? Its code brings it back.",
  remove: "Remove",
  errors: {
    "pins-differ": "The two PINs don't match.",
    terms: "Tick the box to agree before you continue.",
    phone: "Enter the phone number the clinic has for you.",
    "code-format": "Enter the 10-letter code printed on your prescription.",
    "pin-format": "Choose a PIN of 6 digits.",
    "login-format": "Enter your phone number and your 6-digit PIN.",
    "too-many": "Too many tries. Wait 15 minutes and try again.",
    locked: "Too many wrong tries. Wait 15 minutes, or use the code on your prescription to set a new PIN.",
    "code-mismatch": "That phone number and code don't match. Check both and try again.",
    "pin-mismatch": "That phone number and PIN don't match.",
    unavailable: "Prescriptions online are not available here.",
    generic: "That didn't work. Try again.",
  },
};

const bn: PortalWords = {
  brandTag: "অনলাইনে প্রেসক্রিপশন",
  chooseLanguage: "আপনার ভাষা বেছে নিন",
  language: "ভাষা",
  title: "আপনার প্রেসক্রিপশন",
  sub: "ডাক্তারবাবু যে প্রেসক্রিপশন আপনাকে দিয়েছেন, এখানে দেখুন।",
  foot: "শুধু আপনিই, আপনার ফোন নম্বর আর কোড বা পিন দিয়ে, এগুলি খুলতে পারেন।",
  phone: "ফোন নম্বর",
  code: "প্রেসক্রিপশনে ছাপা কোড",
  choosePin: "৬ সংখ্যার একটি পিন বেছে নিন",
  pin: "পিন",
  pinAgain: "একই পিন আবার",
  open: "আমার প্রেসক্রিপশন খুলুন",
  setPin: "পিন রেখে খুলুন",
  opening: "খোলা হচ্ছে…",
  useCode: "প্রথমবার, বা পিন ভুলে গেছেন? প্রেসক্রিপশনের কোড ব্যবহার করুন",
  havePin: "আমার পিন আছে",
  notAvailableTitle: "এখনও চালু হয়নি",
  notAvailable: "এখানে অনলাইনে প্রেসক্রিপশন এখনও চালু হয়নি। আপনার ক্লিনিককে জিজ্ঞাসা করুন।",
  countSub: (n) => `আপনাকে ${n.toLocaleString("bn-IN")}টি প্রেসক্রিপশন দেওয়া হয়েছে, নতুনটি আগে।`,
  nothingShared: "এখন আপনাকে কিছু দেওয়া নেই।",
  emptyBig: "এখানে কোনো প্রেসক্রিপশন নেই",
  emptyText: "ডাক্তারবাবু কোনো প্রেসক্রিপশন দিলে এখানে দেখা যাবে।",
  forName: (name) => `${name}-এর জন্য`,
  signOut: "সাইন আউট",
  deleteAsk: "আমার অ্যাকাউন্ট মুছুন…",
  deleteTitle: "আমার অ্যাকাউন্ট মুছুন",
  deleteText:
    "আপনার পিন মুছে যাবে, আর সব প্রেসক্রিপশন এই তালিকা থেকে সরে যাবে। আইন অনুযায়ী ক্লিনিক নিজের রেকর্ড রাখে। পরে প্রেসক্রিপশনের কোড দিয়ে আবার নতুন অ্যাকাউন্ট খোলা যাবে।",
  typeDelete: "নিশ্চিত করতে DELETE লিখুন",
  cancel: "বাতিল",
  back: "← আপনার প্রেসক্রিপশন",
  print: "প্রিন্ট",
  removeAsk: "আমার তালিকা থেকে সরান",
  removeConfirm: "তালিকা থেকে সরাবেন? এর কোড দিয়ে আবার ফিরিয়ে আনা যায়।",
  remove: "সরান",
  errors: {
    "pins-differ": "দুটি পিন মিলছে না।",
    terms: "এগোনোর আগে রাজি হওয়ার ঘরে টিক দিন।",
    phone: "ক্লিনিকে দেওয়া আপনার ফোন নম্বরটি লিখুন।",
    "code-format": "প্রেসক্রিপশনে ছাপা ১০ অক্ষরের কোডটি লিখুন।",
    "pin-format": "৬ সংখ্যার একটি পিন বেছে নিন।",
    "login-format": "আপনার ফোন নম্বর আর ৬ সংখ্যার পিন লিখুন।",
    "too-many": "অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।",
    locked: "অনেকবার ভুল হয়েছে। ১৫ মিনিট অপেক্ষা করুন, অথবা প্রেসক্রিপশনের কোড দিয়ে নতুন পিন রাখুন।",
    "code-mismatch": "এই ফোন নম্বর আর কোড মিলছে না। দুটোই দেখে আবার চেষ্টা করুন।",
    "pin-mismatch": "এই ফোন নম্বর আর পিন মিলছে না।",
    unavailable: "এখানে অনলাইনে প্রেসক্রিপশন পাওয়া যায় না।",
    generic: "হলো না। আবার চেষ্টা করুন।",
  },
};

const hi: PortalWords = {
  brandTag: "ऑनलाइन पर्चे",
  chooseLanguage: "अपनी भाषा चुनें",
  language: "भाषा",
  title: "आपके पर्चे",
  sub: "डॉक्टर ने जो पर्चे आपके साथ साझा किए हैं, उन्हें यहाँ देखें।",
  foot: "सिर्फ़ आप, अपने फ़ोन नंबर और कोड या पिन से, इन्हें खोल सकते हैं।",
  phone: "फ़ोन नंबर",
  code: "पर्चे पर छपा कोड",
  choosePin: "6 अंकों का पिन चुनें",
  pin: "पिन",
  pinAgain: "वही पिन दोबारा",
  open: "मेरे पर्चे खोलें",
  setPin: "पिन रखें और खोलें",
  opening: "खुल रहा है…",
  useCode: "पहली बार, या पिन भूल गए? पर्चे पर छपा कोड इस्तेमाल करें",
  havePin: "मेरे पास पिन है",
  notAvailableTitle: "अभी उपलब्ध नहीं",
  notAvailable: "यहाँ ऑनलाइन पर्चे अभी शुरू नहीं हुए हैं। अपने क्लिनिक से पूछें।",
  countSub: (n) => `आपके साथ ${n} पर्चे साझा किए गए हैं, नए पहले।`,
  nothingShared: "अभी आपके साथ कुछ साझा नहीं किया गया है।",
  emptyBig: "यहाँ कोई पर्चा नहीं है",
  emptyText: "जब डॉक्टर कोई पर्चा साझा करेंगे, वह यहाँ दिखेगा।",
  forName: (name) => `${name} के लिए`,
  signOut: "साइन आउट",
  deleteAsk: "मेरा खाता मिटाएँ…",
  deleteTitle: "मेरा खाता मिटाएँ",
  deleteText:
    "आपका पिन मिट जाएगा और सभी पर्चे इस सूची से हट जाएँगे। क्लिनिक क़ानून के अनुसार अपना रिकॉर्ड रखता है। बाद में पर्चे के कोड से नया खाता खोला जा सकता है।",
  typeDelete: "पुष्टि के लिए DELETE लिखें",
  cancel: "रद्द करें",
  back: "← आपके पर्चे",
  print: "प्रिंट",
  removeAsk: "मेरी सूची से हटाएँ",
  removeConfirm: "इसे अपनी सूची से हटाएँ? इसके कोड से यह वापस आ जाता है।",
  remove: "हटाएँ",
  errors: {
    "pins-differ": "दोनों पिन मेल नहीं खाते।",
    terms: "आगे बढ़ने से पहले सहमति वाले बॉक्स पर टिक करें।",
    phone: "क्लिनिक में दिया गया अपना फ़ोन नंबर लिखें।",
    "code-format": "पर्चे पर छपा 10 अक्षरों का कोड लिखें।",
    "pin-format": "6 अंकों का पिन चुनें।",
    "login-format": "अपना फ़ोन नंबर और 6 अंकों का पिन लिखें।",
    "too-many": "बहुत बार कोशिश हुई। 15 मिनट बाद फिर कोशिश करें।",
    locked: "बहुत बार गलत हुआ। 15 मिनट रुकें, या पर्चे के कोड से नया पिन रखें।",
    "code-mismatch": "यह फ़ोन नंबर और कोड मेल नहीं खाते। दोनों जाँचकर फिर कोशिश करें।",
    "pin-mismatch": "यह फ़ोन नंबर और पिन मेल नहीं खाते।",
    unavailable: "यहाँ ऑनलाइन पर्चे उपलब्ध नहीं हैं।",
    generic: "नहीं हो पाया। फिर कोशिश करें।",
  },
};

export const PORTAL_WORDS: Record<Lang, PortalWords> = { en, bn, hi };

export function wordsFor(lang: Lang | null | undefined): PortalWords {
  return PORTAL_WORDS[lang ?? "en"] ?? en;
}

/** A server error in the patient's language, when its code is known. */
export function errorText(w: PortalWords, data: { error?: string; code?: string }): string {
  return (data.code && w.errors[data.code]) || data.error || w.errors.generic;
}
