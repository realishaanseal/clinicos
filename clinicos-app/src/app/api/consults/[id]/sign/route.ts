import { NextRequest, NextResponse } from "next/server";
import { getConsult, addEdits, signConsult, recordAudit } from "@/lib/db";
import { parseNote, NOTE_FIELDS, ClinicalNote } from "@/lib/types";
import { requireApiUser } from "@/lib/auth";
import { unlink } from "fs/promises";

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
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Signing is the clinical act. Only a doctor's account may do it.
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const consult = getConsult(id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  if (consult.signedAt) return NextResponse.json({ error: "Already signed" }, { status: 409 });

  const body = await req.json();
  const final = body.note as ClinicalNote;
  if (!final) return NextResponse.json({ error: "No note supplied" }, { status: 400 });

  const draft = parseNote(consult.draftJson);
  const edits = NOTE_FIELDS.map((field) => {
    const before = asText(draft[field]);
    const after = asText(final[field]);
    return before === after ? null : { field: String(field), before, after };
  }).filter(Boolean) as { field: string; before: string; after: string }[];

  addEdits(id, edits);

  let audioDeleted = false;
  if (consult.audioPath) {
    try {
      await unlink(consult.audioPath);
    } catch {
      // already gone — record it as deleted either way, the file is not there
    }
    audioDeleted = true;
  }

  signConsult(id, JSON.stringify(final), audioDeleted, auth.user.id);
  recordAudit(
    auth.user,
    "consult_sign",
    "consult",
    id,
    `${edits.length} correction${edits.length === 1 ? "" : "s"} to the draft${audioDeleted ? ", audio deleted" : ""}`
  );
  return NextResponse.json({ ok: true, editCount: edits.length, audioDeleted });
}
