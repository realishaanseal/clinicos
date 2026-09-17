import { getSettings } from "./db";

/**
 * Clinic identity printed on every prescription.
 *
 * Edited by an admin in the app since v0.5 (the Setting table). Before that it
 * lived in .env, so .env is still read as the fallback and existing installs
 * print exactly what they printed before.
 */
export type ClinicIdentity = { name: string; address: string; phone: string };

export async function getClinic(): Promise<ClinicIdentity> {
  const s = await getSettings();
  return {
    name: s.clinic_name || process.env.CLINIC_NAME || "Demo Clinic",
    address: s.clinic_address ?? process.env.CLINIC_ADDRESS ?? "",
    phone: s.clinic_phone ?? process.env.CLINIC_PHONE ?? "",
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
  doctor: { name: string; qualification: string | null; regNo: string | null } | null
): Promise<PrescriptionIdentity> {
  const clinic = await getClinic();
  if (doctor) {
    return {
      ...clinic,
      doctorName: doctor.name,
      doctorQualification: doctor.qualification || "",
      doctorRegNo: doctor.regNo || "",
    };
  }
  return {
    ...clinic,
    doctorName: process.env.DOCTOR_NAME || "Dr. Demo",
    doctorQualification: process.env.DOCTOR_QUALIFICATION || "",
    doctorRegNo: process.env.DOCTOR_REGNO || "",
  };
}
