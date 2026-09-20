import Link from "next/link";
import { getCurrentPatient, langChosen, portalLang, visitsFor } from "@/lib/portal";
import { decrypt, portalReady } from "@/lib/portal-crypto";
import type { SharedVisit } from "@/lib/share";
import { fmtDate } from "@/lib/time";
import { IcArrow, IcDoc } from "@/components/Icons";
import PortalWelcome, { PortalBrand } from "@/components/PortalWelcome";
import { LangSwitch } from "@/components/PortalLang";
import PortalAccountActions from "@/components/PortalAccountActions";
import { wordsFor } from "@/lib/portal-words";

export const dynamic = "force-dynamic";

/**
 * The patient's own page: the prescriptions their doctors shared with them.
 * Signed out, it is the sign-in. Every word is in the patient's language
 * (lib/portal-words.ts); the prescriptions are as their doctors wrote them.
 */
export default async function PortalHome() {
  const patient = await getCurrentPatient();
  const lang = await portalLang(patient);
  const w = wordsFor(lang);

  if (!portalReady()) {
    return (
      <main className="auth">
        <div className="auth-card" lang={lang}>
          <PortalBrand tag={w.brandTag} />
          <h1>{w.notAvailableTitle}</h1>
          <p className="sub">{w.notAvailable}</p>
        </div>
      </main>
    );
  }

  // Signed out: the language first, on a phone that has not chosen one, then
  // the sign-in in it.
  if (!patient) return <PortalWelcome initialLang={await langChosen()} />;

  const visits = (await visitsFor(patient)).map((v) => {
    try {
      return { id: v.id, ...decrypt<SharedVisit>(v.payloadEnc) };
    } catch {
      return null;
    }
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  return (
    <main className="page page-narrow" lang={lang}>
      <div className="page-head">
        <PortalBrand tag={w.brandTag} />
        <LangSwitch lang={lang} label={w.language} />
        <h1>{w.title}</h1>
        <p className="sub">{visits.length === 0 ? w.nothingShared : w.countSub(visits.length)}</p>
      </div>

      <div className="card flush">
        {visits.length === 0 ? (
          <div className="empty">
            <IcDoc size={26} />
            <div className="big" style={{ marginTop: 10 }}>{w.emptyBig}</div>
            <div>{w.emptyText}</div>
          </div>
        ) : (
          visits.map((v) => (
            <Link key={v.id} href={`/p/visits/${v.id}`} className="delrow" style={{ color: "inherit" }}>
              <div>
                <strong>{fmtDate(v.date, { day: "numeric", month: "long", year: "numeric" })}</strong>
                <div className="muted">
                  {v.clinic.name} · {v.clinic.doctorName}
                </div>
                {(v.note.diagnosis || v.note.chiefComplaint) && (
                  <div style={{ marginTop: 3 }}>{v.note.diagnosis || v.note.chiefComplaint}</div>
                )}
                <div className="dim" style={{ fontSize: 12.5 }}>{w.forName(v.patient.name)}</div>
              </div>
              <IcArrow size={16} />
            </Link>
          ))
        )}
      </div>

      <PortalAccountActions lang={lang} />
    </main>
  );
}
