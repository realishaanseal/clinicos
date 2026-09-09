import { NextRequest, NextResponse } from "next/server";
import { getConsult, setAudioPath, markRecordingStarted } from "@/lib/db";
import { appendFile, mkdir, stat } from "fs/promises";
import path from "path";

export const maxDuration = 60;

/**
 * Append one slice of live audio to disk.
 *
 * The browser posts here every few seconds while recording, instead of holding
 * the whole consultation in memory and uploading at the end. If the tab dies at
 * minute nine, minutes one to nine are already on disk.
 *
 * Chunks are appended in order to a single WebM stream. A stream cut mid-slice
 * loses at most the final fragment; everything before it still decodes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const consult = getConsult(id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  if (!consult.consentGiven) {
    return NextResponse.json({ error: "Consent has not been recorded." }, { status: 403 });
  }
  if (consult.signedAt) {
    return NextResponse.json({ error: "This consultation is already signed." }, { status: 409 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ ok: true, bytes: 0 });

  const dir = path.resolve(process.env.AUDIO_DIR || "./data/audio");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.webm`);

  const first = req.nextUrl.searchParams.get("first") === "1";
  if (first) {
    markRecordingStarted(id);
    setAudioPath(id, filePath);
  } else if (!consult.audioPath) {
    setAudioPath(id, filePath);
  }

  await appendFile(filePath, buf);

  let total = 0;
  try {
    total = (await stat(filePath)).size;
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true, bytes: buf.length, total });
}
