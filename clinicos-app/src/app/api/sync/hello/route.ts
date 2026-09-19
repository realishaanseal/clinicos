import { NextResponse } from "next/server";
import { q } from "@/lib/sql";
import { getSettings, recordAudit } from "@/lib/db";
import { requireDevice } from "@/lib/sync-server";
import { PROTOTYPE } from "@/lib/deployment";

/**
 * A clinic computer introducing itself, when it is connected and before every
 * run. Says which clinic its key belongs to, whether this online copy is still
 * the made-up-patients prototype, and which usernames the clinic has here —
 * so that connecting cannot quietly give one username to two different people.
 */
export async function POST(req: Request) {
  const auth = await requireDevice(req);
  if (auth.denied) return auth.denied;
  const { device, clinic, clockOffset } = auth;

  const body = await req.json().catch(() => ({}));
  const accounts = await q().all<{ id: string; username: string }>(
    `SELECT id, username FROM "User" WHERE "clinicId" = ?`,
    clinic.id
  );
  if (body.connecting === true) {
    await recordAudit(clinic.id, null, "sync_connect", "device", device.id, `${device.name} connected`);
  }
  return NextResponse.json({
    clinic: { name: (await getSettings(clinic.id)).clinic_name || clinic.name, slug: clinic.slug },
    device: { id: device.id, name: device.name },
    prototype: PROTOTYPE,
    accounts,
    serverTime: new Date().toISOString(),
    clockOffset,
  });
}
