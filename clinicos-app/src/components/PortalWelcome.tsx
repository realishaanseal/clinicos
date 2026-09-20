"use client";

import { useState } from "react";
import type { Lang } from "@/lib/terms";
import { wordsFor } from "@/lib/portal-words";
import { Mark } from "./Icons";
import PortalSignIn from "./PortalSignIn";
import { LangPicker, LangSwitch } from "./PortalLang";

/**
 * The portal's front door. The first thing a patient sees on a new phone is
 * the choice of language; after that, the sign-in in that language, with a
 * switch to change it.
 */
export default function PortalWelcome({ initialLang }: { initialLang: Lang | null }) {
  const [lang, setLang] = useState<Lang | null>(initialLang);
  const w = wordsFor(lang);

  return (
    <main className="auth">
      <div className="auth-card" lang={lang ?? undefined}>
        <PortalBrand tag={w.brandTag} />
        {lang === null ? (
          <>
            <h1>Choose your language</h1>
            <p className="sub">
              <span lang="bn">আপনার ভাষা বেছে নিন</span> · <span lang="hi">अपनी भाषा चुनें</span>
            </p>
            <LangPicker onPick={setLang} />
          </>
        ) : (
          <>
            <LangSwitch lang={lang} label={w.language} onChange={setLang} />
            <h1>{w.title}</h1>
            <p className="sub">{w.sub}</p>
            <PortalSignIn key={lang} lang={lang} />
          </>
        )}
      </div>
      {lang && <p className="auth-foot">{w.foot}</p>}
    </main>
  );
}

export function PortalBrand({ tag }: { tag: string }) {
  return (
    <div className="auth-brand">
      <span className="mark">
        <Mark size={21} />
      </span>
      <div>
        <div className="name">ClinicOS</div>
        <div className="tag">{tag}</div>
      </div>
    </div>
  );
}
