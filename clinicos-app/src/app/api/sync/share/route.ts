import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/sync-server";
import { ShareRefusal, revokeShare, shareVisit } from "@/lib/share";

/**
 * A connected clinic computer asking online to share one of its signed visits
 * with the patient, or to stop. The visit must already have reached online (the
 * computer syncs first); the share is made here, where the portal is, and the
 * code comes back to be printed there.
 */
export async function POST(req: Request) {
  const auth = await requireDevice(req);
  if (auth.denied) return auth.denied;
  const { clinic, device } = auth;

  const body = await req.json().catch(() => ({}));
  const consultId = String(body.consultId ?? "");
  // Who pressed the button, as the clinic computer says; recorded as coming
  // from that computer.
  const actor = { id: device.id, name: `${String(body.by ?? "A doctor").slice(0, 80)} (on ${device.name})` };
  try {
    if (body.action === "revoke") {
      return NextResponse.json({ ok: await revokeShare(clinic.id, consultId, actor) });
    }
    const made = await shareVisit(clinic.id, consultId, actor);
    // The computer knows this copy's address — it is the one it was connected
    // with — so it prints the portal's address itself.
    return NextResponse.json({ code: made.code, renewed: made.renewed });
  } catch (e) {
    if (e instanceof ShareRefusal) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
