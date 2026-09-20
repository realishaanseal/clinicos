import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { acceptClinicTerms, getClinicTerms } from "@/lib/clinic";
import { CLINIC_TERMS_VERSION, termsInForce } from "@/lib/terms";

/** Whether the clinic has accepted the ClinicOS terms in force. */
export async function GET() {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const terms = await getClinicTerms(auth.user.clinicId);
  return NextResponse.json({ terms, inForce: termsInForce(terms), version: CLINIC_TERMS_VERSION });
}

/**
 * Accept the terms for the clinic, once: what switches recording on. Only
 * whoever manages the clinic may, because it is an undertaking on the
 * clinic's behalf — to tell every patient, and to record no one who says no.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const body = await req.json().catch(() => ({}));
  if (body.accept !== true) return NextResponse.json({ error: "Tick the box to accept the terms." }, { status: 400 });
  const terms = await acceptClinicTerms(auth.user.clinicId, auth.user);
  return NextResponse.json({ terms, inForce: true });
}
