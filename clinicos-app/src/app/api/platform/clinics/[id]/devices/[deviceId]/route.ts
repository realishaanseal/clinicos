import { NextResponse } from "next/server";
import { asClinicId, recordAudit } from "@/lib/db";
import { operatorActor, requireApiOperator } from "@/lib/platform";
import { revokeDevice } from "@/lib/sync-server";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; deviceId: string }> }) {
  const auth = await requireApiOperator();
  if (auth.denied) return auth.denied;
  const { id, deviceId } = await params;
  const clinicId = asClinicId(id);
  const device = await revokeDevice(clinicId, deviceId);
  if (!device) return NextResponse.json({ error: "That computer isn't connected to this clinic." }, { status: 404 });
  await recordAudit(clinicId, operatorActor(auth.op), "sync_device_revoke", "device", deviceId, device.name);
  return NextResponse.json({ ok: true });
}
