import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentPatient, portalLang, visitFor } from "@/lib/portal";
import { wordsFor } from "@/lib/portal-words";
import { decrypt } from "@/lib/portal-crypto";
import type { SharedVisit } from "@/lib/share";
import Prescription from "@/components/Prescription";
import PortalVisitActions from "@/components/PortalVisitActions";

export const dynamic = "force-dynamic";

/** One shared prescription, exactly as printed. A visit that is not this
 *  patient's, or no longer shared, is simply not found. */
export default async function PortalVisit({ params }: { params: Promise<{ id: string }> }) {
  const patient = await getCurrentPatient();
  if (!patient) redirect("/p");
  const { id } = await params;
  const row = await visitFor(patient, id);
  if (!row) notFound();
  const v = decrypt<SharedVisit>(row.payloadEnc);
  const lang = await portalLang(patient);
  const w = wordsFor(lang);

  return (
    <main className="page">
      <div className="noprint" style={{ marginBottom: 16 }} lang={lang}>
        <Link href="/p">{w.back}</Link>
      </div>
      <PortalVisitActions id={row.id} lang={lang} />
      <Prescription note={v.note} patient={v.patient} clinic={v.clinic} date={v.date} visitId={v.visitId} />
    </main>
  );
}
