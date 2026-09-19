import { NextRequest, NextResponse } from "next/server";
import { getConsult, setAudioPath, markRecordingStarted } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
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
  if (!consult.consentGiven) {
    return NextResponse.json({ error: "Consent has not been recorded." }, { status: 403 });
  }
  if (consult.signedAt) {
    return NextResponse.json({ error: "This consultation is already signed." }, { status: 409 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ ok: true, bytes: 0 });

  const { audioPath, total } = await appendChunk(id, buf);

  const first = req.nextUrl.searchParams.get("first") === "1";
  if (first) {
    await markRecordingStarted(auth.user.clinicId, id);
    await setAudioPath(auth.user.clinicId, id, audioPath);
  } else if (!consult.audioPath) {
    await setAudioPath(auth.user.clinicId, id, audioPath);
  }

  return NextResponse.json({ ok: true, bytes: buf.length, total });
}
