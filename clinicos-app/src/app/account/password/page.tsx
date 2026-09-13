import { requireUser } from "@/lib/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { IcShield } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await requireUser(undefined, { allowPasswordChange: true });

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="eyebrow">Your account</div>
        <h1>Password</h1>
        <p className="sub">Signed in as {user.name} ({user.username}).</p>
      </div>

      {user.mustChangePassword && (
        <div className="note info">
          <IcShield size={17} />
          <span>
            <strong>Choose your own password to continue.</strong> The one you were given was temporary,
            and whoever gave it to you has seen it.
          </span>
        </div>
      )}

      <div className="card">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
