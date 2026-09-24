import { NextRequest, NextResponse } from "next/server";
import { getConsult, setAudioPath, markRecordingStarted } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { RECORDING_OFF, allowRecording } from "@/lib/clinic";
import { appendChunk } from "@/lib/audio-store";

export const maxDuration = 60;

/**
 * Append one slice of live audio to storage.
 *
 * The browser posts here every few seconds while recording, instead of holding
 * the whole consultation in memory and uploading at the end. If the tab dies at
 * minute nine, minutes one to nine are already stored.
 *
 * Chunks are appended in order to a single WebM stream. A stream cut mid-slice
 * loses at most the final fragment; everything before it still decodes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const consult = await getConsult(auth.user.clinicId, id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  if (consult.signedAt) {
    return NextResponse.json({ error: "This consultation is already signed." }, { status: 409 });
  }
  // Hard gate, on the server: nothing is stored unless the clinic has accepted
  // ClinicOS's terms, in which it tells every patient and records no one who
  // says no (CLAUDE.md, invariant 5).
  if (!(await allowRecording(auth.user.clinicId, consult))) {
    return NextResponse.json({ error: RECORDING_OFF, code: "terms" }, { status: 403 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ ok: true, bytes: 0 });

  // "first" is the first slice after Record was pressed. Pressing it a second
  // time continues the same consultation, but the browser has started a fresh
  // WebM stream, so it becomes a new part rather than bytes on the end of the
  // old one — see the note at the top of audio-store.ts.
  const first = req.nextUrl.searchParams.get("first") === "1";

  const { audioPath, total, part } = await appendChunk(id, buf, first);

  if (first) {
    await markRecordingStarted(auth.user.clinicId, id);
    await setAudioPath(auth.user.clinicId, id, audioPath);
  } else if (!consult.audioPath) {
    await setAudioPath(auth.user.clinicId, id, audioPath);
  }

  return NextResponse.json({ ok: true, bytes: buf.length, total, part });
}
