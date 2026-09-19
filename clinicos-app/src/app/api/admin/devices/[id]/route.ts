import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { SYNC_SERVER_ENABLED, revokeDevice } from "@/lib/sync-server";

/** Switch a clinic computer off: a lost or replaced laptop. Its key stops
 *  working at once; what it already holds stays on it. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  if (!SYNC_SERVER_ENABLED) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { id } = await params;
  const device = await revokeDevice(auth.user.clinicId, id);
  if (!device) return NextResponse.json({ error: "That computer isn't connected here." }, { status: 404 });
  await recordAudit(auth.user.clinicId, auth.user, "sync_device_revoke", "device", id, device.name);
  return NextResponse.json({ ok: true });
}
