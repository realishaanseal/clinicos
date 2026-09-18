import { getConsultWithPatient, getUserPublic, previousSignedConsults } from "@/lib/db";
import { notFound } from "next/navigation";
import { parseNote, noteHasContent } from "@/lib/types";
import ConsultWorkflow from "@/components/ConsultWorkflow";
import { prescriptionIdentity } from "@/lib/clinic";
import { requireUser } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ConsultPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("clinical");

  const { id } = await params;
  const c = await getConsultWithPatient(id);
  if (!c) notFound();

  // The letterhead names the doctor who signed. While unsigned, that is the
  // doctor working on it now. Notes signed before accounts existed have no
  // doctor recorded and keep the old .env doctor.
  const signer = c.doctorId ? await getUserPublic(c.doctorId) ?? null : null;
  const identity = await prescriptionIdentity(c.signedAt ? signer : user);

  // The patient's last signed visit, for "repeat these medicines". Only what
  // the doctor signed then — never anything from its draft or transcript.
  const [last] = c.signedAt ? [] : await previousSignedConsults(c.patientId, c.id, 1);
  const lastNote = last ? parseNote(last.finalJson) : null;
  const lastVisit = last && lastNote
    ? {
        signedAt: last.signedAt!,
        diagnosis: lastNote.diagnosis || lastNote.chiefComplaint,
        medications: lastNote.medications.filter((m) => m.name.trim()),
      }
    : null;

  return (
    <div className="page">
      <div className="page-head noprint">
        <div className="eyebrow">
          {c.signedAt ? "Signed consultation" : "Consultation in progress"}
        </div>
        <h1>{c.patient.name}</h1>
        <p className="sub">
          {[
            c.patient.age !== null ? `${c.patient.age} years` : null,
            c.patient.sex,
            c.patient.phone,
          ].filter(Boolean).join(" · ") || "No details recorded"}
          {" · "}
          <Link href={`/patients/${c.patientId}`}>View full history</Link>
        </p>
      </div>

      <ConsultWorkflow
        consultId={c.id}
        patient={{
          name: c.patient.name,
          age: c.patient.age,
          sex: c.patient.sex,
          phone: c.patient.phone,
          guardianName: c.patient.guardianName,
        }}
        initial={{
          consentGiven: !!c.consentGiven,
          hasAudio: !!c.audioPath,
          transcript: c.transcript || "",
          // workingJson first: the doctor's autosaved edits beat the AI draft.
          note: parseNote(c.finalJson || c.workingJson || c.draftJson),
          recovered: !!c.workingJson && !c.signedAt,
          workingSavedAt: c.workingSavedAt,
          recordingInterrupted: !!c.recordingStartedAt && !c.recordingEndedAt && !c.signedAt,
          // Typing began with no AI draft behind it: this visit is being written
          // by hand, so reopen it in that mode rather than at the consent step.
          manual: !c.signedAt && !c.draftJson && noteHasContent(parseNote(c.workingJson)),
          signedAt: c.signedAt,
          audioDeleted: !!c.audioDeletedAt,
          asrModel: c.asrModel,
          asrSeconds: c.asrSeconds,
          llmModel: c.llmModel,
          llmSeconds: c.llmSeconds,
        }}
        clinic={identity}
        lastVisit={lastVisit}
      />
    </div>
  );
}
