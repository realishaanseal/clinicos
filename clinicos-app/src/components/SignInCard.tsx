import Link from "next/link";
import LoginForm from "./LoginForm";
import { Mark } from "./Icons";
import { getClinicName } from "@/lib/clinic";
import type { Tenant } from "@/lib/db";
import { MULTI_CLINIC } from "@/lib/tenant";
import type { SignInAs } from "./SignInChooser";

/** What each door says. The form underneath is the same one: which row someone
 *  came through changes the words, never what their account may open. */
const DOOR: Record<"doctor" | "admin", { title: string; sub: string }> = {
  doctor: {
    title: "Doctor sign-in",
    sub: "Use the username and password the clinic gave you. The front desk signs in here too.",
  },
  admin: {
    title: "Clinic admin sign-in",
    sub: "Use the username and password the clinic gave you. What you can open depends on your account, not on this page.",
  },
};

/**
 * The sign-in card, for /login and for a clinic's own address, /c/<slug>.
 * With a clinic it names that clinic; without one it asks which clinic.
 */
export default async function SignInCard({
  clinic,
  next,
  as = null,
  patientDoor = false,
}: {
  clinic: Tenant | null;
  next: string | null;
  as?: SignInAs;
  patientDoor?: boolean;
}) {
  const name = clinic ? await getClinicName(clinic.id) : "Sign in to your clinic";
  const door = as ? DOOR[as] : null;
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="mark">
            <Mark size={21} />
          </span>
          <div>
            <div className="name">ClinicOS</div>
            <div className="tag">{name}</div>
          </div>
        </div>
        <h1>{door?.title ?? "Sign in"}</h1>
        <p className="sub">{door?.sub ?? "Use the username and password the clinic gave you."}</p>
        <LoginForm next={next} clinic={clinic?.slug ?? null} />
        {MULTI_CLINIC && clinic && (
          <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
            Not {name}? <Link href="/login?choose=1">Sign in to another clinic</Link>
          </p>
        )}
      </div>
      <p className="auth-foot">
        {patientDoor && (
          <>
            Looking for your own prescriptions? <Link href="/p">Sign in as a patient</Link>
            <br />
          </>
        )}
        Forgotten your password? Ask whoever manages the clinic to reset it.
      </p>
    </main>
  );
}
