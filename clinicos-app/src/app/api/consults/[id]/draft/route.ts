import { NextRequest, NextResponse } from "next/server";
import { getConsult, saveWorking } from "@/lib/db";

/**
 * Autosave of work in progress — the corrected transcript and the doctor's
 * in-progress edits to the note.
 *
 * Writes to workingJson, never to draftJson. The AI's original draft has to
 * stay untouched or the edit diff produced at signing becomes a lie.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const consult = getConsult(id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  if (consult.signedAt) return NextResponse.json({ error: "Already signed" }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const transcript = typeof body.transcript === "string" ? body.transcript : null;
  const note = body.note ? JSON.stringify(body.note) : null;

  if (transcript === null && note === null) return NextResponse.json({ ok: true });

  saveWorking(id, transcript, note);
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
