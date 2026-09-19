import { redirect } from "next/navigation";
import { getCurrentOperator } from "@/lib/platform";
import PlatformLoginForm from "@/components/PlatformLoginForm";
import { Mark } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function PlatformLoginPage() {
  if (await getCurrentOperator()) redirect("/platform");
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="mark">
            <Mark size={21} />
          </span>
          <div>
            <div className="name">ClinicOS</div>
            <div className="tag">Varaxis platform</div>
          </div>
        </div>
        <h1>Operator sign-in</h1>
        <p className="sub">For Varaxis staff setting clinics up. Clinic staff sign in at their clinic&apos;s own address.</p>
        <PlatformLoginForm />
      </div>
    </main>
  );
}
