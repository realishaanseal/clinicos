import { NextRequest, NextResponse } from "next/server";
import { getConsult, markRecordingEnded } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { audioBytes } from "@/lib/audio-store";

/** Close the recording cleanly. If this never arrives — because the tab died —
 *  recordingEndedAt stays null and Today shows the consultation as interrupted. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const consult = await getConsult(id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const seconds = Number(body.seconds) || null;

  const bytes = consult.audioPath ? await audioBytes(consult.audioPath) : null;

  await markRecordingEnded(id, seconds, bytes);
  return NextResponse.json({ ok: true, bytes });
}
