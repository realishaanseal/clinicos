import { NextRequest, NextResponse } from "next/server";
import { getPatient, deletePatientCascade, recordAudit } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { unlink } from "fs/promises";

/**
 * Permanent deletion of a patient and their entire record.
 *
 * The caller must send back the patient's name exactly. This is not
 * decoration — it is the difference between "I meant to delete this one" and
 * "I clicked the wrong row in a list of sixty".
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const patient = await getPatient(id);
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

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

  const report = await deletePatientCascade(id);
  if (!report) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  // The database cannot remove files; clear any audio left on disk.
  let audioDeleted = 0;
  for (const p of report.audioPaths) {
    try {
      await unlink(p);
      audioDeleted++;
    } catch {
      /* already gone */
    }
  }

  // Deliberately no name in the log. This is often an erasure request, and the
  // activity log must not become the one place the patient still exists.
  await recordAudit(
    auth.user,
    "patient_delete",
    "patient",
    id,
    `${report.consultsDeleted} consultation${report.consultsDeleted === 1 ? "" : "s"} removed`
  );

  return NextResponse.json({ ok: true, ...report, audioDeleted });
}
