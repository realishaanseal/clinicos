import { NextRequest, NextResponse } from "next/server";
import { getTenant, recordAudit } from "@/lib/db";
import { operatorActor, requireApiOperator } from "@/lib/platform";
import { cleanText } from "@/lib/users";
import { parseFeatures } from "@/lib/tenant";
import { createDevice } from "@/lib/sync-server";

/**
 * A clinic-computer key made by Varaxis, for a clinic moving its existing
 * computer's records online before anyone there has an account online: the
 * first run sends that computer's records and accounts up.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiOperator();
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const clinic = await getTenant(id);
  if (!clinic) return NextResponse.json({ error: "That clinic doesn't exist." }, { status: 404 });
  if (!parseFeatures(clinic.features).localSync) {
    return NextResponse.json({ error: "Switch clinic computer sync on for this clinic first." }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const name = cleanText(body.name, 80) || "Clinic computer";
  const actor = operatorActor(auth.op);
  const { device, key } = await createDevice(clinic.id, name, actor.name);
  await recordAudit(clinic.id, actor, "sync_device_create", "device", device.id, name);
  return NextResponse.json({ device: { id: device.id, name: device.name }, key });
}
