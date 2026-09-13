import { redirect } from "next/navigation";
import { getCurrentUser, homeFor, safeNextPath } from "@/lib/auth";
import { countUsers } from "@/lib/db";
import { getClinic } from "@/lib/clinic";
import LoginForm from "@/components/LoginForm";
import { Mark } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (countUsers() === 0) redirect("/setup");
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user));

  const { next } = await searchParams;

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="mark">
            <Mark size={21} />
          </span>
          <div>
            <div className="name">ClinicOS</div>
            <div className="tag">{getClinic().name}</div>
          </div>
        </div>
        <h1>Sign in</h1>
        <p className="sub">Use the username and password the clinic gave you.</p>
        <LoginForm next={safeNextPath(next)} />
      </div>
      <p className="auth-foot">Forgotten your password? Ask whoever manages the clinic to reset it.</p>
    </main>
  );
}
