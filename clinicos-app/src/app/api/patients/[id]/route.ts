import { NextRequest, NextResponse } from "next/server";
import { getPatient, deletePatientCascade, recordAudit, countConsultsForPatient } from "@/lib/db";
import { can, PAUSED_MESSAGE, requireApiUser } from "@/lib/auth";
import { removeAudio } from "@/lib/audio-store";

/**
 * Permanent deletion of a patient and their entire record.
 *
 * The caller must send back the patient's name exactly. This is not
 * decoration — it is the difference between "I meant to delete this one" and
 * "I clicked the wrong row in a list of sixty".
 *
 * Who may delete:
 *   - a clinic admin, any patient
 *   - the front desk or a doctor, only a patient with no consultations: a record
 *     registered by mistake, a duplicate or a typo, which holds nothing clinical.
 *     Once a consultation exists the record is a clinical record, and deleting it
 *     stays an admin's decision.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth.denied) return auth.denied;
  const isAdmin = can(auth.user, "admin");
  if (!isAdmin && !can(auth.user, "frontdesk")) {
    return NextResponse.json({ error: "Your account doesn't have access to this." }, { status: 403 });
  }
  if (!isAdmin && auth.user.clinicStatus === "suspended") {
    return NextResponse.json({ error: PAUSED_MESSAGE }, { status: 403 });
  }

  const { id } = await params;

  const patient = await getPatient(auth.user.clinicId, id);
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  if (!isAdmin && (await countConsultsForPatient(auth.user.clinicId, id)) > 0) {
    return NextResponse.json(
      { error: "This patient has consultations, so only a clinic admin can delete the record. Nothing was deleted." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const typed = String(body.confirmName ?? "").trim();

  // Case-insensitive and whitespace-tolerant, but it must be the whole name.
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  if (norm(typed) !== norm(patient.name)) {
    return NextResponse.json(
      { error: "The name you typed does not match this patient's name. Nothing was deleted." },
      { status: 400 }
    );
  }

  const report = await deletePatientCascade(auth.user.clinicId, id);
  if (!report) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  // The database cannot remove files; clear any recording left on disk. One
  // held in the database has already gone with the consultation.
  let audioDeleted = 0;
  for (const p of report.audioPaths) {
    await removeAudio(p);
    audioDeleted++;
  }

  // Deliberately no name in the log. This is often an erasure request, and the
  // activity log must not become the one place the patient still exists.
  await recordAudit(
    auth.user.clinicId,
    auth.user,
    "patient_delete",
    "patient",
    id,
    `${report.consultsDeleted} consultation${report.consultsDeleted === 1 ? "" : "s"} removed`
  );

  return NextResponse.json({ ok: true, ...report, audioDeleted });
}
