"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { ClinicalNote } from "@/lib/types";
import { cardRows, cardWords, type CardLanguage } from "@/lib/rx-card";
import { Mark } from "./Icons";
import { fmt, fmtDate } from "@/lib/time";

type Props = {
  note: ClinicalNote;
  patient: { name: string; age: number | null; sex: string | null; phone?: string | null };
  clinic: {
    name: string;
    address: string;
    phone: string;
    doctorName: string;
    doctorQualification: string;
    doctorRegNo: string;
    /** A data: URL checked when it was uploaded (api/admin/prescription). */
    logo?: string;
    cardLanguage?: CardLanguage | null;
  };
  date: string;
  visitId: string;
  /** Just shared with the patient: where they read it online, and their code.
   *  Printed at the foot, with a QR code, this once. */
  portal?: { address: string; code: string } | null;
};

/**
 * The printed prescription.
 *
 * This is the only artefact of ClinicOS a patient actually holds, shows to a
 * pharmacist, and keeps in a drawer for two years. For a clinic charging ₹500
 * it is also the most visible signal of whether the practice is modern. Treat
 * it as the product, not as output.
 */
export default function Prescription({ note, patient, clinic, date, visitId, portal }: Props) {
  const d = new Date(date);
  // Headings the patient must not miss, in English and, when the clinic prints
  // a timing card, in that card's language too.
  const inTheirLanguage = (en: string, bn: string, hi: string) =>
    clinic.cardLanguage === "bn" ? `${en} · ${bn}` : clinic.cardLanguage === "hi" ? `${en} · ${hi}` : en;
  // The code goes after "#": a phone opening the QR never sends it to a server.
  const qr = useMemo(() => {
    if (!portal) return null;
    const q = qrcode(0, "M");
    q.addData(`${portal.address}#code=${portal.code}`);
    q.make();
    return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
  }, [portal]);
  const meds = note.medications.filter((m) => m.name?.trim());
  const investigations = note.investigations.filter((x) => x?.trim());

  return (
    <div className="rx-wrap">
      <div className="rx">
        {/* ---------------------------------------------------- letterhead */}
        <header className="rx-head">
          <div className="rx-id">
            {clinic.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing to optimise
              <img className="rx-logo" src={clinic.logo} alt={`${clinic.name} logo`} />
            ) : (
              <span className="rx-mark">
                <Mark size={23} />
              </span>
            )}
            <div>
              <div className="rx-clinic">{clinic.name}</div>
              <div className="rx-addr">
                {clinic.address}
                {clinic.phone && (
                  <>
                    <br />
                    {clinic.phone}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="rx-doc">
            <div className="dn">{clinic.doctorName}</div>
            {clinic.doctorQualification && <div className="dq">{clinic.doctorQualification}</div>}
            {clinic.doctorRegNo && <div>Reg. No. {clinic.doctorRegNo}</div>}
          </div>
        </header>

        {/* --------------------------------------------------- patient strip */}
        <div className="rx-strip">
          <div className="f" style={{ minWidth: 190 }}>
            <div className="k">Patient</div>
            <div className="v">{patient.name}</div>
          </div>
          <div className="f">
            <div className="k">Age / Sex</div>
            <div className="v">
              {patient.age !== null ? `${patient.age}` : "—"}
              {patient.sex ? ` / ${patient.sex}` : ""}
            </div>
          </div>
          {patient.phone && (
            <div className="f">
              <div className="k">Contact</div>
              <div className="v">{patient.phone}</div>
            </div>
          )}
          <div className="f">
            <div className="k">Date</div>
            <div className="v">
              {fmtDate(d, { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------- body */}
        <div className="rx-body">
          <div className="rx-watermark" aria-hidden>
            <Mark size={340} color="#0b5e55" />
          </div>

          {note.diagnosis && (
            <div className="rx-dx">
              <div className="k">Diagnosis</div>
              <div className="v">{note.diagnosis}</div>
            </div>
          )}

          {(note.chiefComplaint || note.history) && (
            <div className="rx-sec">
              <div className="h">Complaint &amp; history</div>
              <div className="t">
                {[note.chiefComplaint, note.history].filter(Boolean).join(" — ")}
              </div>
            </div>
          )}

          {note.examination && (
            <div className="rx-sec">
              <div className="h">Examination</div>
              <div className="t">{note.examination}</div>
            </div>
          )}

          {/* ------------------------------------------------------ the Rx */}
          <div className="rx-script" style={{ marginTop: 18 }}>
            <div className="rx-symbol">℞</div>
            <div className="rx-meds">
              {meds.length === 0 ? (
                <div className="t" style={{ color: "#6b7a77", fontSize: 13, paddingTop: 8 }}>
                  No medication prescribed.
                </div>
              ) : (
                meds.map((m, i) => (
                  <div className="rx-med" key={i}>
                    <span className="i">{i + 1}.</span>
                    <div>
                      <div className="nm">
                        {m.name} {m.dose && <span className="ds">{m.dose}</span>}
                      </div>
                      {(m.frequency || m.duration || m.instructions) && (
                        <div className="mt">
                          {m.frequency && <span>{m.frequency}</span>}
                          {m.duration && <span>{m.duration}</span>}
                          {m.instructions && <span>{m.instructions}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {(investigations.length > 0 || note.advice) && (
            <div className="rx-two">
              <div>
                {investigations.length > 0 && (
                  <div className="rx-sec">
                    <div className="h">Investigations</div>
                    <ul className="rx-list">
                      {investigations.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div>
                {note.advice && (
                  <div className="rx-sec">
                    <div className="h">Advice</div>
                    <div className="t">{note.advice}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(note.followUp || note.followUpOn) && (
            <div className="rx-followup">
              <strong>Follow up</strong>
              {note.followUp}
              {note.followUpOn && (
                <span className="rx-on">
                  {inTheirLanguage("Come back on", "আবার আসুন", "फिर आएँ")}{" "}
                  <b>{fmtDate(new Date(`${note.followUpOn}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b>
                </span>
              )}
            </div>
          )}

          {note.returnIf?.trim() && (
            <div className="rx-return" role="note">
              <strong>{inTheirLanguage("Come back at once if", "অবিলম্বে আসুন যদি", "तुरंत आएँ अगर")}</strong>
              {note.returnIf}
            </div>
          )}

          {clinic.cardLanguage && meds.length > 0 && <TimingCard meds={meds} lang={clinic.cardLanguage} />}
        </div>

        {/* ------------------------------------------------------ signature */}
        <div className="rx-sign">
          <div className="stamp">
            This prescription is valid only with the doctor&apos;s signature. Please bring it to your next
            visit. Take medicines exactly as written above and complete the full course.
          </div>
          <div className="sig">
            <div className="ln">{clinic.doctorName}</div>
            <div className="sub">{clinic.doctorQualification}</div>
          </div>
        </div>

        {portal && qr && (
          <div className="rx-portal">
            <div
              className="qr"
              aria-label="QR code for this prescription online"
              // An SVG built by the QR library from the address alone.
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <div>
              <div className="h">{inTheirLanguage("This prescription on your phone", "আপনার ফোনে এই প্রেসক্রিপশন", "आपके फ़ोन पर यह पर्चा")}</div>
              <div>
                Open <b>{portal.address.replace(/^https?:\/\//, "")}</b>, or scan the code, with your phone number and
                this code:
              </div>
              <div className="code">{portal.code}</div>
            </div>
          </div>
        )}

        <footer className="rx-foot">
          <div className="lhs">
            <Mark size={11} color="#5eccc2" />
            <span>
              Prepared with <b>ClinicOS</b> · reviewed and signed by the attending physician
            </span>
          </div>
          <span className="mono" style={{ fontSize: 9 }}>
            {visitId.slice(-8).toUpperCase()} ·{" "}
            {fmt(d, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </footer>
      </div>
    </div>
  );
}

/** When to take each medicine, in the patient's language, with pictures: a
 *  re-reading of what the doctor wrote (lib/rx-card.ts), never a new decision. */
function TimingCard({ meds, lang }: { meds: ClinicalNote["medications"]; lang: CardLanguage }) {
  const rows = cardRows(meds, lang);
  const w = cardWords(lang);
  const dose = (n: number) => (n === 0.5 ? "½" : w.digits(String(n)));
  return (
    <div className="rx-card" lang={lang}>
      <div className="h">{w.title}</div>
      <table>
        <thead>
          <tr>
            <th />
            <th><SunIcon /> {w.morning}</th>
            <th><NoonIcon /> {w.afternoon}</th>
            <th><MoonIcon /> {w.night}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="nm">{r.name}</td>
              {r.slots ? (
                (["morning", "afternoon", "night"] as const).map((k) => (
                  <td key={k} className={`slot ${r.slots![k] ? "on" : ""}`}>{r.slots![k] ? dose(r.slots![k]) : "—"}</td>
                ))
              ) : (
                <td colSpan={3} className="words">{r.when}</td>
              )}
              <td className="fd">{[r.food, r.duration].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SunIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="12" cy="14" r="4" />
    <path d="M12 4v2M4 14h2M18 14h2M6.3 8.3l1.4 1.4M17.7 8.3l-1.4 1.4M3 20h18" />
  </svg>
);
const NoonIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
  </svg>
);
const MoonIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);
