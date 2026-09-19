import { redirect } from "next/navigation";
import { getCurrentUser, homeFor, safeNextPath } from "@/lib/auth";
import { countUsers } from "@/lib/db";
import { MULTI_CLINIC, resolveClinic } from "@/lib/tenant";
import SignInCard from "@/components/SignInCard";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; clinic?: string; choose?: string }>;
}) {
  const { next, clinic: slug, choose } = await searchParams;
  // ?choose=1 is "sign in to another clinic": ignore the one remembered.
  const clinic = choose ? null : await resolveClinic(slug);

  if (clinic && (await countUsers(clinic.id)) === 0) {
    redirect(MULTI_CLINIC ? `/setup?clinic=${clinic.slug}` : "/setup");
  }
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user));

  return <SignInCard clinic={clinic} next={safeNextPath(next)} />;
}
