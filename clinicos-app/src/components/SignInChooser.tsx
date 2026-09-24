import Link from "next/link";
import { IcArrow, IcDoc, IcCog, IcMic, Mark } from "./Icons";

/**
 * Who is signing in.
 *
 * Almost everyone who reaches ClinicOS online is a patient looking for a
 * prescription — a clinic has one doctor and one desk between all of them — so
 * the patient's door is first and the largest, and the clinic's people take one
 * extra tap.
 *
 * **The doctor and clinic-admin rows lead to the same username-and-password
 * form.** The label is wayfinding, not a check: what an account may do is
 * decided by its role in `requireUser()` / `requireApiUser()`, never by which
 * link someone came through. Signing in through the wrong row still lands
 * wherever that account belongs.
 *
 * The clinic-admin row is temporary. Once each clinic has its own subdomain and
 * Varaxis sets its admin up from the platform console, the admin arrives at the
 * clinic's own address and this row goes — delete it and nothing else changes.
 *
 * Only shown where there is a patient portal to send anyone to: online, with
 * the portal's keys set. A clinic computer has no portal, so it keeps going
 * straight to the sign-in.
 */
/** Which door someone came through. Wayfinding only — never a permission. */
export type SignInAs = "doctor" | "admin" | null;

export default function SignInChooser() {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="mark">
            <Mark size={21} />
          </span>
          <div>
            <div className="name">ClinicOS</div>
            <div className="tag">Sign in</div>
          </div>
        </div>
        <h1>Who is signing in?</h1>
        <p className="sub">Choose the one that is you.</p>

        <Link href="/p" className="who main">
          <span className="ico">
            <IcDoc size={19} />
          </span>
          <span className="txt">
            <strong>I am a patient</strong>
            <span>See the prescriptions your doctor has shared with you.</span>
          </span>
          <IcArrow size={16} />
        </Link>

        <div className="who-rest">
          <Link href="/login?as=doctor" className="who">
            <span className="ico">
              <IcMic size={17} />
            </span>
            <span className="txt">
              <strong>I am a doctor</strong>
              <span>Consultations, notes and prescriptions.</span>
            </span>
            <IcArrow size={15} />
          </Link>

          <Link href="/login?as=admin" className="who">
            <span className="ico">
              <IcCog size={17} />
            </span>
            <span className="txt">
              <strong>I manage the clinic</strong>
              <span>People, clinic details, backups and the activity log.</span>
            </span>
            <IcArrow size={15} />
          </Link>
        </div>
      </div>
      <p className="auth-foot">Front desk? Use the doctor&apos;s sign-in — the same username and password.</p>
    </main>
  );
}
