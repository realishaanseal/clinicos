/**
 * The online side of keeping a clinic computer in step: which computers may,
 * and the check every one of their requests passes. Online only.
 *
 * A clinic computer proves itself with a key made when it was connected —
 * shown once, only its hash kept. The key is as powerful as the clinic's own
 * admin over that clinic's records and nothing else: every change it sends is
 * written into its own clinic, and it can read nothing of any other.
 *
 * Server only.
 */
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { BACKEND, q } from "./sql";
import { getTenant, newId, type ClinicId, type Tenant } from "./db";
import { parseFeatures } from "./tenant";

export const SYNC_SERVER_ENABLED = BACKEND === "postgres";

export type SyncDevice = {
  id: string;
  clinicId: string;
  name: string;
  keyHash: string;
  createdAt: string;
  createdBy: string | null;
  lastSeenAt: string | null;
  clockOffset: number | null;
  revokedAt: string | null;
};

/** A device's key: long, random, and marked so that a key pasted into the
 *  wrong box is recognisable. */
export function newDeviceKey(): { key: string; hash: string } {
  const key = `cos_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashKey(key) };
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function listDevices(clinicId: ClinicId): Promise<SyncDevice[]> {
  return q().all<SyncDevice>(
    `SELECT * FROM "SyncDevice" WHERE "clinicId" = ? ORDER BY "revokedAt" IS NOT NULL, "createdAt" DESC`,
    clinicId
  );
}

export async function createDevice(clinicId: ClinicId, name: string, createdBy: string): Promise<{ device: SyncDevice; key: string }> {
  const { key, hash } = newDeviceKey();
  const id = newId();
  await q().run(
    `INSERT INTO "SyncDevice" (id, "clinicId", name, "keyHash", "createdAt", "createdBy") VALUES (?, ?, ?, ?, ?, ?)`,
    id, clinicId, name, hash, new Date().toISOString(), createdBy
  );
  const device = (await q().get<SyncDevice>(`SELECT * FROM "SyncDevice" WHERE id = ?`, id))!;
  return { device, key };
}

/** Switch a computer off. Its next request is refused; what it already holds
 *  stays on it, as the clinic's own copy. */
export async function revokeDevice(clinicId: ClinicId, id: string): Promise<SyncDevice | undefined> {
  const d = await q().get<SyncDevice>(`SELECT * FROM "SyncDevice" WHERE id = ? AND "clinicId" = ?`, id, clinicId);
  if (!d || d.revokedAt) return d;
  await q().run(`UPDATE "SyncDevice" SET "revokedAt" = ? WHERE id = ? AND "clinicId" = ?`, new Date().toISOString(), id, clinicId);
  return d;
}

export type DeviceAuth =
  | { device: SyncDevice; clinic: Tenant; clockOffset: number | null; denied?: undefined }
  | { denied: NextResponse; device?: undefined; clinic?: undefined; clockOffset?: undefined };

const deny = (status: number, error: string) => ({ denied: NextResponse.json({ error }, { status }) });

/**
 * The check for every sync request: a live key, a clinic whose plan includes
 * clinic-computer sync, and a clinic that is not paused. Also notes when the
 * computer was last seen and how far its clock is from ours.
 */
export async function requireDevice(req: Request): Promise<DeviceAuth> {
  if (!SYNC_SERVER_ENABLED) return deny(404, "Not found.");
  const auth = req.headers.get("authorization") || "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key.startsWith("cos_")) return deny(401, "This computer's key is missing. Connect it again from Clinic admin.");

  const device = await q().get<SyncDevice>(`SELECT * FROM "SyncDevice" WHERE "keyHash" = ?`, hashKey(key));
  if (!device || device.revokedAt) {
    return deny(401, "This computer's key has been switched off. Ask whoever manages the clinic online for a new one.");
  }
  const clinic = await getTenant(device.clinicId);
  if (!clinic) return deny(401, "The clinic this computer was connected to no longer exists.");
  if (!parseFeatures(clinic.features).localSync) {
    return deny(403, "Keeping a clinic computer in step is not part of this clinic's plan. Contact Varaxis to add it.");
  }
  if (clinic.status === "suspended") {
    return deny(403, "ClinicOS online is paused for this clinic. This computer keeps working on its own; contact Varaxis.");
  }

  const theirs = Date.parse(req.headers.get("x-clinicos-time") || "");
  const clockOffset = Number.isFinite(theirs) ? Math.round((theirs - Date.now()) / 1000) : null;
  await q().run(
    `UPDATE "SyncDevice" SET "lastSeenAt" = ?, "clockOffset" = ? WHERE id = ?`,
    new Date().toISOString(), clockOffset, device.id
  );
  return { device, clinic, clockOffset };
}
