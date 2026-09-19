import { NextRequest, NextResponse } from "next/server";
import { getConsultWithPatient } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { describeAccess } from "@/lib/users";
import { ShareRefusal, revokeShare, shareVisit } from "@/lib/share";
import { SYNC_CLIENT_ENABLED, SyncError, shareThroughOnline } from "@/lib/sync-client";
import { normalisePhone } from "@/lib/portal-crypto";
import { publicAppUrl } from "@/lib/public-url";

/**
 * Share a signed visit with the patient, after asking them (v0.5 Part C). The
 * answer carries the code to print on the prescription — shown this once and
 * never stored. Sharing again gives a new code and the old one stops working.
 *
 * Online the share is made here; on a clinic computer, by its clinic online.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  if (body.consent !== true) {
    return NextResponse.json({ error: "Ask the patient first, and share only if they agree." }, { status: 400 });
  }
  const c = await getConsultWithPatient(auth.user.clinicId, id);
  if (!c) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  if (!c.signedAt) return NextResponse.json({ error: "Only a signed visit can be shared." }, { status: 409 });
  if (!normalisePhone(c.patient.phone)) {
    return NextResponse.json(
      { error: "Add the patient's phone number first: they sign in with it to read the prescription." },
      { status: 400 }
    );
  }

  // Who asked the patient, from the session, not from what the browser says.
  const consentBy = `${auth.user.name} (${describeAccess(auth.user.role, auth.user.isAdmin)})`;
  try {
    if (SYNC_CLIENT_ENABLED) {
      const made = await shareThroughOnline(id, "share", auth.user.name, consentBy);
      return NextResponse.json({ code: made.code, portalUrl: made.portalUrl });
    }
    const made = await shareVisit(auth.user.clinicId, id, auth.user, consentBy);
    return NextResponse.json({ code: made.code, renewed: made.renewed, portalUrl: `${await publicAppUrl()}/p` });
  } catch (e) {
    if (e instanceof ShareRefusal) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof SyncError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}

/** Stop sharing: the patient can no longer open it, even by its address. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;
  const { id } = await params;
  if (!(await getConsultWithPatient(auth.user.clinicId, id))) {
    return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  }
  try {
    const ok = SYNC_CLIENT_ENABLED
      ? (await shareThroughOnline(id, "revoke", auth.user.name, "")).ok
      : await revokeShare(auth.user.clinicId, id, auth.user);
    return NextResponse.json({ ok: !!ok });
  } catch (e) {
    if (e instanceof SyncError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
