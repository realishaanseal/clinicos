import { favouriteView, getConsultWithPatient, getUserPublic, listFavourites, previousSignedConsults } from "@/lib/db";
import { notFound } from "next/navigation";
import { parseNote, noteHasContent } from "@/lib/types";
import ConsultWorkflow from "@/components/ConsultWorkflow";
import { prescriptionIdentity } from "@/lib/clinic";
import { can, requireUser } from "@/lib/auth";
import { getClinicTerms } from "@/lib/clinic";
import { termsInForce } from "@/lib/terms";
import Link from "next/link";
import { getShare } from "@/lib/share";
import { BACKEND } from "@/lib/sql";
import { portalReady, PORTAL_NOT_READY } from "@/lib/portal-crypto";
import { getSyncStatus } from "@/lib/sync-client";

export const dynamic = "force-dynamic";

export default async function ConsultPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("clinical");

  const { id } = await params;
  const c = await getConsultWithPatient(user.clinicId, id);
  if (!c) notFound();

  // The letterhead names the doctor who signed. While unsigned, that is the
  // doctor working on it now. Notes signed before accounts existed have no
  // doctor recorded and keep the old .env doctor.
  const signer = c.doctorId ? await getUserPublic(user.clinicId, c.doctorId) ?? null : null;
  const identity = await prescriptionIdentity(user.clinicId, c.signedAt ? signer : user);

  // The patient's last signed visit, for "repeat these medicines". Only what
  // the doctor signed then — never anything from its draft or transcript.
  const [last] = c.signedAt ? [] : await previousSignedConsults(user.clinicId, c.patientId, c.id, 1);
  const lastNote = last ? parseNote(last.finalJson) : null;
  const lastVisit = last && lastNote
    ? {
        signedAt: last.signedAt!,
        diagnosis: lastNote.diagnosis || lastNote.chiefComplaint,
        medications: lastNote.medications.filter((m) => m.name.trim()),
      }
    : null;

  const terms = c.signedAt ? null : await getClinicTerms(user.clinicId);

  // Sharing with the patient happens online, where the portal is: directly
  // there, or through the clinic online from a connected clinic computer.
  let sharing = { share: null as { sharedAt: string; revokedAt: string | null } | null, available: false, reason: null as string | null };
  if (c.signedAt) {
    const s = await getShare(user.clinicId, c.id);
    const connected = BACKEND === "sqlite" && (await getSyncStatus()).connected;
    sharing = {
      share: s ? { sharedAt: s.sharedAt, revokedAt: s.revokedAt } : null,
      available: BACKEND === "postgres" ? portalReady() : connected,
      reason:
        BACKEND === "postgres"
          ? PORTAL_NOT_READY
          : "Sharing with the patient needs this computer connected to its clinic on ClinicOS online (Clinic admin → ClinicOS online).",
    };
  }

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
          hasAudio: !!c.audioPath,
          transcript: c.transcript || "",
          // workingJson first: the doctor's autosaved edits beat the AI draft.
          note: parseNote(c.finalJson || c.workingJson || c.draftJson),
          recovered: !!c.workingJson && !c.signedAt,
          workingSavedAt: c.workingSavedAt,
          recordingInterrupted: !!c.recordingStartedAt && !c.recordingEndedAt && !c.signedAt,
          // Typing began with no AI draft behind it: this visit is being written
          // by hand, so reopen it in that mode rather than at the recorder.
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
        favourites={c.signedAt ? [] : (await listFavourites(user.id)).map(favouriteView)}
        sharing={sharing}
        recording={{
          // A visit already recorded, or consented the old way, carries on.
          mayRecord: !!c.consentGiven || termsInForce(terms),
          terms,
          canAccept: can(user, "admin"),
        }}
      />
    </div>
  );
}
