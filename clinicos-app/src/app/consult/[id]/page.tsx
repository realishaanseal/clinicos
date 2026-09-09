import { getConsultWithPatient } from "@/lib/db";
import { notFound } from "next/navigation";
import { parseNote } from "@/lib/types";
import ConsultWorkflow from "@/components/ConsultWorkflow";
import { clinic } from "@/lib/clinic";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ConsultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getConsultWithPatient(id);
  if (!c) notFound();

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
          signedAt: c.signedAt,
          audioDeleted: !!c.audioDeletedAt,
          asrModel: c.asrModel,
          asrSeconds: c.asrSeconds,
          llmModel: c.llmModel,
          llmSeconds: c.llmSeconds,
        }}
        clinic={clinic}
      />
    </div>
  );
}
