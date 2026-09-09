import { NextRequest, NextResponse } from "next/server";
import { getConsult, markRecordingEnded } from "@/lib/db";
import { stat } from "fs/promises";

/** Close the recording cleanly. If this never arrives — because the tab died —
 *  recordingEndedAt stays null and Today shows the consultation as interrupted. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const consult = getConsult(id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const seconds = Number(body.seconds) || null;

  let bytes: number | null = null;
  if (consult.audioPath) {
    try {
      bytes = (await stat(consult.audioPath)).size;
    } catch {
      bytes = null;
    }
  }

  markRecordingEnded(id, seconds, bytes);
  return NextResponse.json({ ok: true, bytes });
}
