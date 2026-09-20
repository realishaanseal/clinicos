/**
 * Sharing a signed visit with the patient (v0.5 Part C).
 *
 * The doctor presses Share, and ClinicOS puts exactly the printed prescription
 * where the patient can read it on their phone — never the transcript, the
 * recording, the AI draft or the corrections. The patient agrees to the
 * portal's terms themselves, once, in their own language, the first time they
 * sign in (lib/terms.ts); until then nobody can open it, and a patient who
 * never signs in has shared nothing with anyone.
 *
 * The share is made online, where the portal is. A clinic computer connected
 * to its clinic online asks online to make it (sync-client.ts), and gets the
 * PortalShare row back through sync, without its secrets. A clinic computer
 * that is not connected cannot share: there is nowhere for the patient to read
 * it.
 *
 * Server only.
 */
import { BACKEND, q } from "./sql";
import { getConsultWithPatient, getUserPublic, newId, recordAudit, type AuditActor, type ClinicId } from "./db";
import { prescriptionIdentity, type PrescriptionIdentity } from "./clinic";
import { parseNote, type ClinicalNote } from "./types";
import { codeHash, encrypt, newShareCode, normalisePhone, phoneHmac, portalReady, PORTAL_NOT_READY } from "./portal-crypto";

/** What the patient sees: the prescription as printed, and nothing more. */
export type SharedVisit = {
  visitId: string;
  date: string;
  clinic: PrescriptionIdentity;
  patient: { name: string; age: number | null; sex: string | null };
  note: ClinicalNote;
};

export type ShareRow = {
  id: string;
  consultId: string;
  sharedAt: string;
  sharedBy: string | null;
  consentBy: string | null;
  revokedAt: string | null;
};

export class ShareRefusal extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** The latest share of a visit, on either kind of ClinicOS. */
export function getShare(clinicId: ClinicId, consultId: string): Promise<ShareRow | undefined> {
  return q().get<ShareRow>(
    `SELECT id, "consultId", "sharedAt", "sharedBy", "consentBy", "revokedAt" FROM "PortalShare"
     WHERE "clinicId" = ? AND "consultId" = ? ORDER BY "sharedAt" DESC LIMIT 1`,
    clinicId, consultId
  );
}

/**
 * Share a signed visit, or give an existing share a new code (the printout
 * with the old one was lost: the old code stops working). Returns the code,
 * which is shown once to be printed and never stored — only its hash.
 */
export async function shareVisit(
  clinicId: ClinicId,
  consultId: string,
  actor: NonNullable<AuditActor>
): Promise<{ code: string; share: ShareRow; renewed: boolean }> {
  if (BACKEND !== "postgres") throw new ShareRefusal("Visits are shared from ClinicOS online.", 409);
  if (!portalReady()) throw new ShareRefusal(PORTAL_NOT_READY, 503);

  const c = await getConsultWithPatient(clinicId, consultId);
  if (!c) throw new ShareRefusal("Consult not found", 404);
  if (!c.signedAt || !c.finalJson) throw new ShareRefusal("Only a signed visit can be shared.", 409);
  const phone = normalisePhone(c.patient.phone);
  if (!phone) {
    throw new ShareRefusal("Add the patient's phone number first: they sign in with it to read the prescription.", 400);
  }

  const signer = c.doctorId ? (await getUserPublic(clinicId, c.doctorId)) ?? null : null;
  const payload: SharedVisit = {
    visitId: c.id,
    date: c.signedAt,
    clinic: await prescriptionIdentity(clinicId, signer),
    patient: { name: c.patient.name, age: c.patient.age, sex: c.patient.sex },
    note: parseNote(c.finalJson),
  };
  const code = newShareCode();
  const now = new Date().toISOString();

  const live = await q().get<ShareRow>(
    `SELECT id, "consultId", "sharedAt", "sharedBy", "consentBy", "revokedAt" FROM "PortalShare"
     WHERE "clinicId" = ? AND "consultId" = ? AND "revokedAt" IS NULL`,
    clinicId, consultId
  );
  if (live) {
    await q().run(
      `UPDATE "PortalShare" SET "codeHash" = ?, "payloadEnc" = ?, "phoneHmac" = ?, "hiddenAt" = NULL
       WHERE id = ? AND "clinicId" = ?`,
      codeHash(code), encrypt(payload), phoneHmac(phone), live.id, clinicId
    );
    await recordAudit(clinicId, actor, "consult_share", "consult", consultId, "new code for the shared prescription");
    return { code, share: live, renewed: true };
  }

  const id = newId();
  await q().run(
    `INSERT INTO "PortalShare" (id, "clinicId", "consultId", "patientId", "visitDate", "sharedAt", "sharedBy", "consentBy",
                                "phoneHmac", "codeHash", "payloadEnc")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, clinicId, consultId, c.patientId, c.signedAt.slice(0, 10), now, actor.name, null,
    phoneHmac(phone), codeHash(code), encrypt(payload)
  );
  await recordAudit(clinicId, actor, "consult_share", "consult", consultId, "shared with the patient");
  return { code, share: (await getShare(clinicId, consultId))!, renewed: false };
}

/** Stop sharing. The patient can no longer open it, even by its address. */
export async function revokeShare(clinicId: ClinicId, consultId: string, actor: NonNullable<AuditActor>): Promise<boolean> {
  const { changes } = await q().run(
    `UPDATE "PortalShare" SET "revokedAt" = ? WHERE "clinicId" = ? AND "consultId" = ? AND "revokedAt" IS NULL`,
    new Date().toISOString(), clinicId, consultId
  );
  if (changes) await recordAudit(clinicId, actor, "consult_share_revoke", "consult", consultId, "stopped sharing with the patient");
  return changes > 0;
}
