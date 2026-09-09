"use client";

import { ClinicalNote } from "@/lib/types";
import { Mark } from "./Icons";

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
  };
  date: string;
  visitId: string;
};

/**
 * The printed prescription.
 *
 * This is the only artefact of ClinicOS a patient actually holds, shows to a
 * pharmacist, and keeps in a drawer for two years. For a clinic charging ₹500
 * it is also the most visible signal of whether the practice is modern. Treat
 * it as the product, not as output.
 */
export default function Prescription({ note, patient, clinic, date, visitId }: Props) {
  const d = new Date(date);
  const meds = note.medications.filter((m) => m.name?.trim());
  const investigations = note.investigations.filter((x) => x?.trim());

  return (
    <div className="rx-wrap">
      <div className="rx">
        {/* ---------------------------------------------------- letterhead */}
        <header className="rx-head">
          <div className="rx-id">
            <span className="rx-mark">
              <Mark size={23} />
            </span>
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
              {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
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

          {note.followUp && (
            <div className="rx-followup">
              <strong>Follow up</strong>
              {note.followUp}
            </div>
          )}
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

        <footer className="rx-foot">
          <div className="lhs">
            <Mark size={11} color="#5eccc2" />
            <span>
              Prepared with <b>ClinicOS</b> · reviewed and signed by the attending physician
            </span>
          </div>
          <span className="mono" style={{ fontSize: 9 }}>
            {visitId.slice(-8).toUpperCase()} ·{" "}
            {d.toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </footer>
      </div>
    </div>
  );
}
