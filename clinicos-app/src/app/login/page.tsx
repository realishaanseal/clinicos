import { redirect } from "next/navigation";
import { getCurrentUser, homeFor, safeNextPath } from "@/lib/auth";
import { countUsers } from "@/lib/db";
import { MULTI_CLINIC, resolveClinic } from "@/lib/tenant";
import SignInCard from "@/components/SignInCard";
import SignInChooser, { type SignInAs } from "@/components/SignInChooser";
import { PORTAL_ENABLED } from "@/lib/portal";
import { portalReady } from "@/lib/portal-crypto";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; clinic?: string; choose?: string; as?: string }>;
}) {
  const { next, clinic: slug, choose, as } = await searchParams;
  // ?choose=1 is "sign in to another clinic": ignore the one remembered.
  const clinic = choose ? null : await resolveClinic(slug);

  if (clinic && (await countUsers(clinic.id)) === 0) {
    redirect(MULTI_CLINIC ? `/setup?clinic=${clinic.slug}` : "/setup");
  }
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user));

  // Is there a patient portal to send anyone to? Only online, and only once its
  // keys are set — otherwise the patient's door leads to "not available yet",
  // and a clinic computer has no portal at all. Where there is none, this page
  // is the clinic's sign-in exactly as it always was.
  const patientDoor = PORTAL_ENABLED && portalReady();
  const asRole: SignInAs = as === "doctor" || as === "admin" ? as : null;

  // "Who is signing in?" is for someone arriving cold. Not for a ?next=, which
  // means they were already heading for a clinic screen and were bounced here;
  // not for ?choose=1, which comes off the form itself; and not once ?as= says
  // they have answered.
  if (patientDoor && !next && !choose && !asRole) return <SignInChooser />;

  return <SignInCard clinic={clinic} next={safeNextPath(next)} as={asRole} patientDoor={patientDoor} />;
}
