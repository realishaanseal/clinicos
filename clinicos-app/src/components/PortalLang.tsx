"use client";

import { useRouter } from "next/navigation";
import { LANGS, LANG_COOKIE, LANG_NAME, type Lang } from "@/lib/terms";

/** Remember the patient's language on this phone for a year. Not a secret:
 *  only which words to show. */
export function rememberLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
}

/** The first thing the portal shows: which language, in each language. */
export function LangPicker({ onPick }: { onPick: (l: Lang) => void }) {
  return (
    <div className="lang-pick" role="group" aria-label="Choose your language · আপনার ভাষা বেছে নিন · अपनी भाषा चुनें">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className="ghost"
          lang={l}
          onClick={() => {
            rememberLang(l);
            onPick(l);
          }}
        >
          {LANG_NAME[l]}
        </button>
      ))}
    </div>
  );
}

/** Switching language later, on any portal page. */
export function LangSwitch({ lang, label, onChange }: { lang: Lang; label: string; onChange?: (l: Lang) => void }) {
  const router = useRouter();
  return (
    <div className="lang-switch noprint" role="group" aria-label={label}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          className={l === lang ? "on" : ""}
          aria-pressed={l === lang}
          onClick={() => {
            rememberLang(l);
            if (onChange) onChange(l);
            else router.refresh();
          }}
        >
          {LANG_NAME[l]}
        </button>
      ))}
    </div>
  );
}
