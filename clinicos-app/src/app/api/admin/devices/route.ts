import { NextRequest, NextResponse } from "next/server";
import { getTenant, recordAudit } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { cleanText } from "@/lib/users";
import { parseFeatures } from "@/lib/tenant";
import { SYNC_SERVER_ENABLED, createDevice, listDevices } from "@/lib/sync-server";

async function allowed(clinicId: Parameters<typeof getTenant>[0]) {
  if (!SYNC_SERVER_ENABLED) return "Only ClinicOS online connects clinic computers.";
  const clinic = await getTenant(clinicId);
  if (!clinic || !parseFeatures(clinic.features).localSync) {
    return "Keeping a clinic computer in step is not part of this clinic's plan. Contact Varaxis to add it.";
  }
  return null;
}

/** The clinic's computers that keep in step with it. Never their keys. */
export async function GET() {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const problem = await allowed(auth.user.clinicId);
  if (problem) return NextResponse.json({ error: problem }, { status: 403 });
  const devices = await listDevices(auth.user.clinicId);
  return NextResponse.json({ devices: devices.map(({ keyHash, ...d }) => (void keyHash, d)) });
}

/** Connect a new clinic computer: a key, shown once, to paste into it. */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const problem = await allowed(auth.user.clinicId);
  if (problem) return NextResponse.json({ error: problem }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = cleanText(body.name, 80);
  if (!name) return NextResponse.json({ error: "Name the computer, like “Reception laptop”." }, { status: 400 });

  const { device, key } = await createDevice(auth.user.clinicId, name, auth.user.name);
  await recordAudit(auth.user.clinicId, auth.user, "sync_device_create", "device", device.id, name);
  return NextResponse.json({ device: { id: device.id, name: device.name }, key });
}
