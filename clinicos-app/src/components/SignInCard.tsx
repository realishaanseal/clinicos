import Link from "next/link";
import LoginForm from "./LoginForm";
import { Mark } from "./Icons";
import { getClinic } from "@/lib/clinic";
import type { Tenant } from "@/lib/db";
import { MULTI_CLINIC } from "@/lib/tenant";

/**
 * The sign-in card, for /login and for a clinic's own address, /c/<slug>.
 * With a clinic it names that clinic; without one it asks which clinic.
 */
export default async function SignInCard({ clinic, next }: { clinic: Tenant | null; next: string | null }) {
  const name = clinic ? (await getClinic(clinic.id)).name : "Sign in to your clinic";
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
        <h1>Sign in</h1>
        <p className="sub">Use the username and password the clinic gave you.</p>
        <LoginForm next={next} clinic={clinic?.slug ?? null} />
        {MULTI_CLINIC && clinic && (
          <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
            Not {name}? <Link href="/login?choose=1">Sign in to another clinic</Link>
          </p>
        )}
      </div>
      <p className="auth-foot">Forgotten your password? Ask whoever manages the clinic to reset it.</p>
    </main>
  );
}
