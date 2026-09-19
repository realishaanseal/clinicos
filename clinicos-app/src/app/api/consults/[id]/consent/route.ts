import { NextRequest, NextResponse } from "next/server";
import { getConsult, setConsent } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { describeAccess } from "@/lib/users";

// Consent is a precondition, not a checkbox. No other route in this app will
// accept audio for a consult until this has been set.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Front desk may take consent: the script is meant to be read by clinic staff.
  const auth = await requireApiUser("frontdesk");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  if (!await getConsult(auth.user.clinicId, id)) return NextResponse.json({ error: "Consult not found" }, { status: 404 });

  // Record who actually took consent, from the session, not from what the
  // browser claims.
  await setConsent(auth.user.clinicId, id, `${auth.user.name} (${describeAccess(auth.user.role, auth.user.isAdmin)})`);
  return NextResponse.json({ ok: true });
}
