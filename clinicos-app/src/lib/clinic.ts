import { FIRST_CLINIC_ID, getSetting, getSettings, recordAudit, setConsent, setSettings, type ClinicId } from "./db";
import { parseCardLanguage, type CardLanguage } from "./rx-card";
import { CLINIC_TERMS_VERSION, parseClinicTerms, termsInForce, type ClinicTerms } from "./terms";

/**
 * Clinic identity printed on every prescription.
 *
 * Edited by an admin in the app since v0.5 (ClinicSetting). Before that it
 * lived in .env, so .env is still read as the fallback for the first clinic —
 * the only one there was — and existing installs print exactly what they
 * printed before. Any other clinic's details are its own: one clinic's .env
 * address must never appear on another clinic's prescription.
 */
export type ClinicIdentity = {
  name: string;
  address: string;
  phone: string;
  /** The clinic's logo for the letterhead (#25), as a data: URL, or "". */
  logo: string;
  /** The medicine timing card's language (#9), or null when the clinic prints none. */
  cardLanguage: CardLanguage | null;
};

export async function getClinic(clinicId: ClinicId): Promise<ClinicIdentity> {
  const s = await getSettings(clinicId);
  const env: Record<string, string | undefined> = clinicId === FIRST_CLINIC_ID ? process.env : {};
  return {
    name: s.clinic_name || env.CLINIC_NAME || "Demo Clinic",
    address: s.clinic_address ?? env.CLINIC_ADDRESS ?? "",
    phone: s.clinic_phone ?? env.CLINIC_PHONE ?? "",
    logo: s.clinic_logo ?? "",
    cardLanguage: parseCardLanguage(s.rx_card_language),
  };
}

/** Just the name, for the navigation and sign-in on every page: the rest of
 *  the identity carries the logo, which is too large to load everywhere. */
export async function getClinicName(clinicId: ClinicId): Promise<string> {
  const env: Record<string, string | undefined> = clinicId === FIRST_CLINIC_ID ? process.env : {};
  return (await getSetting(clinicId, "clinic_name")) || env.CLINIC_NAME || "Demo Clinic";
}

/** The consultation fee that starts every new bill (in paise, or null when the
 *  clinic has not set one), and the follow-up reminder's words, or "" for the
 *  default. Both are clinic_ settings, so they travel to a clinic computer. */
export async function getBillingSettings(clinicId: ClinicId): Promise<{ feePaise: number | null; recallMessage: string }> {
  const fee = Number((await getSetting(clinicId, "clinic_fee")) || "");
  return {
    feePaise: Number.isInteger(fee) && fee > 0 ? fee : null,
    recallMessage: (await getSetting(clinicId, "clinic_recall_message")) ?? "",
  };
}

export type PrescriptionIdentity = ClinicIdentity & {
  doctorName: string;
  doctorQualification: string;
  doctorRegNo: string;
};

/**
 * Letterhead for one prescription. The doctor is whoever signed it; before a
 * consultation is signed, the doctor working on it. Consultations signed
 * before accounts existed have no doctor on record and keep the .env doctor.
 */
export async function prescriptionIdentity(
  clinicId: ClinicId,
  doctor: { name: string; qualification: string | null; regNo: string | null } | null
): Promise<PrescriptionIdentity> {
  const clinic = await getClinic(clinicId);
  if (doctor) {
    return {
      ...clinic,
      doctorName: doctor.name,
      doctorQualification: doctor.qualification || "",
      doctorRegNo: doctor.regNo || "",
    };
  }
  // Only the first clinic has visits from before accounts existed.
  const env: Record<string, string | undefined> = clinicId === FIRST_CLINIC_ID ? process.env : {};
  return {
    ...clinic,
    doctorName: env.DOCTOR_NAME || "Dr. Demo",
    doctorQualification: env.DOCTOR_QUALIFICATION || "",
    doctorRegNo: env.DOCTOR_REGNO || "",
  };
}

// ------------------------------------------------------------------ terms
/**
 * The clinic's acceptance of ClinicOS's terms (lib/terms.ts), which is what
 * lets it record: the recording routes refuse until the version in force has
 * been accepted. A clinic_ setting, so it reaches a connected clinic computer
 * too, and one acceptance covers every copy of the clinic.
 */
export async function getClinicTerms(clinicId: ClinicId): Promise<ClinicTerms | null> {
  return parseClinicTerms(await getSetting(clinicId, "clinic_terms"));
}

export async function clinicMayRecord(clinicId: ClinicId): Promise<boolean> {
  return termsInForce(await getClinicTerms(clinicId));
}

export async function acceptClinicTerms(clinicId: ClinicId, by: { id: string; name: string }): Promise<ClinicTerms> {
  const terms: ClinicTerms = { version: CLINIC_TERMS_VERSION, at: new Date().toISOString(), byName: by.name };
  await setSettings(clinicId, { clinic_terms: JSON.stringify(terms) });
  await recordAudit(clinicId, by, "terms_accept", "clinic", null, `ClinicOS terms of ${CLINIC_TERMS_VERSION}`);
  return terms;
}

export const RECORDING_OFF =
  "Recording is off until whoever manages the clinic accepts ClinicOS's terms, once, in Clinic admin. You can still write the note by hand.";

/**
 * May this visit be recorded? One consented the old way, visit by visit, still
 * may. Otherwise the clinic must have accepted the terms in force, and the
 * visit is marked as recorded under them — so every recorded visit still says,
 * in its own row, on what basis it was recorded.
 */
export async function allowRecording(clinicId: ClinicId, consult: { id: string; consentGiven: number }): Promise<boolean> {
  if (consult.consentGiven) return true;
  const t = await getClinicTerms(clinicId);
  if (!t || !termsInForce(t)) return false;
  await setConsent(clinicId, consult.id, `Under the clinic's terms, accepted by ${t.byName} on ${t.at.slice(0, 10)}`);
  return true;
}
