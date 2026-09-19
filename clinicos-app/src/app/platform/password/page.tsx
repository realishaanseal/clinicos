import { requireOperator } from "@/lib/platform";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { IcShield } from "@/components/Icons";
import { appPath } from "@/lib/base-path";

export const dynamic = "force-dynamic";

export default async function PlatformPasswordPage() {
  const op = await requireOperator({ allowPasswordChange: true });
  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="eyebrow">Your operator account</div>
        <h1>Password</h1>
        <p className="sub">Signed in as {op.name} ({op.username}).</p>
      </div>
      {op.mustChangePassword && (
        <div className="note info">
          <IcShield size={17} />
          <span>
            <strong>Choose your own password to continue</strong> — at least 12 characters. The one you were given was
            temporary.
          </span>
        </div>
      )}
      <div className="card">
        <ChangePasswordForm endpoint={appPath("/api/platform/password")} />
      </div>
    </div>
  );
}
