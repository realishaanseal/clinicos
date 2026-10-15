import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { countUsers, getTenantBySlug } from "@/lib/db";
import SignInCard from "@/components/SignInCard";
import { orRecordsUnavailable } from "@/components/DatabaseDown";
import { appPath } from "@/lib/base-path";
import { Mark } from "@/components/Icons";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/**
 * A clinic's own address: vxclinicos.vercel.app/app/c/<slug>. The link
 * Varaxis gives a clinic, and the one its people bookmark. It opens setup
 * until the clinic's first account exists, and its sign-in after that.
 */
export default async function ClinicAddressPage(props: Props) {
  const { slug } = await props.params;
  return orRecordsUnavailable(appPath(`/c/${encodeURIComponent(slug)}`), () => clinicDoor(props));
}

async function clinicDoor({ params }: Props) {
  const { slug } = await params;
  const clinic = await getTenantBySlug(slug);

  if (!clinic) {
    return (
      <main className="auth">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="mark">
              <Mark size={21} />
            </span>
            <div>
              <div className="name">ClinicOS</div>
            </div>
          </div>
          <h1>No clinic at this address</h1>
          <p className="sub">Check the address your clinic was given. It ends with the clinic&apos;s ID.</p>
        </div>
      </main>
    );
  }

  if ((await countUsers(clinic.id)) === 0) redirect(`/setup?clinic=${clinic.slug}`);

  const user = await getCurrentUser();
  if (user && user.clinicId === clinic.id) redirect(homeFor(user));

  return <SignInCard clinic={clinic} next={null} />;
}
