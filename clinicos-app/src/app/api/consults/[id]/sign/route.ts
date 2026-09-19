import { NextRequest, NextResponse } from "next/server";
import { getConsult, addEdits, signConsult, recordAudit, markQueueDoneForConsult } from "@/lib/db";
import { parseNote, normalizeNote, noteHasContent, NOTE_FIELDS } from "@/lib/types";
import { requireApiUser } from "@/lib/auth";
import { removeAudio } from "@/lib/audio-store";

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return JSON.stringify(v);
}

/**
 * Signing does four things, in this order:
 *   1. diffs the doctor's version against the AI draft and logs every change
 *   2. stores the signed note, with the signing doctor's account
 *   3. deletes the raw audio — the promise made in the consent script
 *   4. records the signature in the activity log
 *
 * A note written by hand (a quick visit, or a patient who declined recording)
 * has no AI draft. Step 1 is skipped for it: diffing against an empty draft
 * would log every word the doctor typed as a "correction" and make the
 * accuracy metric a lie.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Signing is the clinical act. Only a doctor's account may do it.
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const consult = await getConsult(auth.user.clinicId, id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  if (consult.signedAt) return NextResponse.json({ error: "Already signed" }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  if (!body.note) return NextResponse.json({ error: "No note supplied" }, { status: 400 });
  const final = normalizeNote(body.note);
  if (!noteHasContent(final)) {
    return NextResponse.json({ error: "The note is empty. Write at least the complaint, a diagnosis or a medicine before signing." }, { status: 400 });
  }

  const drafted = !!consult.draftJson;
  const draft = parseNote(consult.draftJson);
  const edits = drafted
    ? (NOTE_FIELDS.map((field) => {
        const before = asText(draft[field]);
        const after = asText(final[field]);
        return before === after ? null : { field: String(field), before, after };
      }).filter(Boolean) as { field: string; before: string; after: string }[])
    : [];

  await addEdits(auth.user.clinicId, id, edits);

  let audioDeleted = false;
  if (consult.audioPath) {
    // Already gone counts as deleted: either way the recording is not there.
    await removeAudio(consult.audioPath);
    audioDeleted = true;
  }

  await signConsult(auth.user.clinicId, id, JSON.stringify(final), audioDeleted, auth.user.id, final.followUpOn || null);
  // Signing is what tells the front desk the patient has been seen.
  await markQueueDoneForConsult(auth.user.clinicId, id);
  const what = drafted
    ? `${edits.length} correction${edits.length === 1 ? "" : "s"} to the draft`
    : "written by hand, no AI draft";
  await recordAudit(auth.user.clinicId, auth.user, "consult_sign", "consult", id, `${what}${audioDeleted ? ", audio deleted" : ""}`);
  return NextResponse.json({ ok: true, editCount: drafted ? edits.length : null, handwritten: !drafted, audioDeleted });
}
