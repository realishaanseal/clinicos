import { NextRequest, NextResponse } from "next/server";
import { getConsult, addEdits, signConsult } from "@/lib/db";
import { parseNote, NOTE_FIELDS, ClinicalNote } from "@/lib/types";
import { unlink } from "fs/promises";

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return JSON.stringify(v);
}

/**
 * Signing does three things, in this order:
 *   1. diffs the doctor's version against the AI draft and logs every change
 *   2. stores the signed note
 *   3. deletes the raw audio — the promise made in the consent script
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  signConsult(id, JSON.stringify(final), audioDeleted);
  return NextResponse.json({ ok: true, editCount: edits.length, audioDeleted });
}
