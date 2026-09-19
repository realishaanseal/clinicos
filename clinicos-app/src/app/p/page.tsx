import Link from "next/link";
import { getCurrentPatient, visitsFor } from "@/lib/portal";
import { decrypt, portalReady } from "@/lib/portal-crypto";
import type { SharedVisit } from "@/lib/share";
import { fmtDate } from "@/lib/time";
import { Mark, IcArrow, IcDoc } from "@/components/Icons";
import PortalSignIn from "@/components/PortalSignIn";
import PortalAccountActions from "@/components/PortalAccountActions";

export const dynamic = "force-dynamic";

/**
 * The patient's own page: the prescriptions their doctors shared with them.
 * Signed out, it is the sign-in.
 */
export default async function PortalHome() {
  const patient = await getCurrentPatient();

  if (!portalReady()) {
    return (
      <main className="auth">
        <div className="auth-card">
          <Brand />
          <h1>Not available yet</h1>
          <p className="sub">Prescriptions online are not switched on here yet. Ask your clinic.</p>
        </div>
      </main>
    );
  }

  if (!patient) {
    return (
      <main className="auth">
        <div className="auth-card">
          <Brand />
          <h1>Your prescriptions</h1>
          <p className="sub">
            See the prescriptions your doctor shared with you.
            <br />
            <span lang="bn">ডাক্তারবাবু যে প্রেসক্রিপশন আপনাকে দিয়েছেন, এখানে দেখুন।</span>
          </p>
          <PortalSignIn />
        </div>
        <p className="auth-foot">Only you, with your phone number and your code or PIN, can open these.</p>
      </main>
    );
  }

  const visits = (await visitsFor(patient)).map((v) => {
    try {
      return { id: v.id, ...decrypt<SharedVisit>(v.payloadEnc) };
    } catch {
      return null;
    }
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  return (
    <main className="page page-narrow">
      <div className="page-head">
        <Brand />
        <h1>Your prescriptions</h1>
        <p className="sub">
          {visits.length === 0
            ? "Nothing shared with you right now."
            : `${visits.length} prescription${visits.length === 1 ? "" : "s"} shared with you, newest first.`}
        </p>
      </div>

      <div className="card flush">
        {visits.length === 0 ? (
          <div className="empty">
            <IcDoc size={26} />
            <div className="big" style={{ marginTop: 10 }}>No prescriptions here</div>
            <div>When a doctor shares one with you, it appears here.</div>
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
                <div className="dim" style={{ fontSize: 12.5 }}>For {v.patient.name}</div>
              </div>
              <IcArrow size={16} />
            </Link>
          ))
        )}
      </div>

      <PortalAccountActions />
    </main>
  );
}

function Brand() {
  return (
    <div className="auth-brand">
      <span className="mark">
        <Mark size={21} />
      </span>
      <div>
        <div className="name">ClinicOS</div>
        <div className="tag">Prescriptions online</div>
      </div>
    </div>
  );
}
