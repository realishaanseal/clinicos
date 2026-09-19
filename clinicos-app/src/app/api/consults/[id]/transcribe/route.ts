import { NextRequest, NextResponse } from "next/server";
import { getConsult, setTranscript } from "@/lib/db";
import { getAsr } from "@/lib/asr";
import { requireApiUser } from "@/lib/auth";
import { readAudio } from "@/lib/audio-store";

// Local transcription of a long consultation can take minutes; a hosted service
// takes seconds. 300 is the most the online host allows on its free plan.
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const consult = await getConsult(auth.user.clinicId, id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  // A signed note is the record; its transcript is part of what was signed.
  if (consult.signedAt) return NextResponse.json({ error: "This consultation is already signed." }, { status: 409 });
  if (!consult.audioPath) return NextResponse.json({ error: "No audio recorded yet" }, { status: 400 });

  try {
    const { buf, filename } = await readAudio(consult.audioPath);
    const result = await getAsr().transcribe(buf, filename);
    await setTranscript(auth.user.clinicId, id, result.text, result.model, result.seconds);
    return NextResponse.json({ transcript: result.text, model: result.model, seconds: result.seconds });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
