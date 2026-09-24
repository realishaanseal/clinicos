import { NextRequest, NextResponse } from "next/server";
import { getConsult, setTranscript } from "@/lib/db";
import { getAsr } from "@/lib/asr";
import { requireApiUser } from "@/lib/auth";
import { readParts } from "@/lib/audio-store";

// Local transcription of a long consultation can take minutes; a hosted service
// takes seconds. 300 is the most the online host allows on its free plan.
export const maxDuration = 300;

/**
 * Turn the recording into text.
 *
 * A recording has one part per press of Record (audio-store.ts). Consult
 * .transcribedParts says how many of them the transcript already covers, so
 * pressing Record again and transcribing adds what was just said instead of
 * transcribing the whole consultation over: the doctor's corrections survive,
 * and anything they deleted stays deleted.
 *
 * With nothing new recorded, this is a deliberate "do it again" — every part is
 * transcribed and the transcript replaced, which is the only way to redo a bad
 * one.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const consult = await getConsult(auth.user.clinicId, id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  // A signed note is the record; its transcript is part of what was signed.
  if (consult.signedAt) return NextResponse.json({ error: "This consultation is already signed." }, { status: 409 });
  if (!consult.audioPath) return NextResponse.json({ error: "No audio recorded yet" }, { status: 400 });

  // What the doctor has on screen, which may be newer than the autosaved copy.
  // It is the text kept in front of whatever is transcribed now.
  const body = await req.json().catch(() => ({}));
  const onScreen = typeof body?.transcript === "string" ? body.transcript : null;

  try {
    const parts = await readParts(consult.audioPath);
    const covered = consult.transcribedParts ?? 0;
    const fresh = parts.filter((p) => p.part > covered);

    const todo = fresh.length ? fresh : parts;
    const kept = fresh.length ? (onScreen ?? consult.transcript ?? "").trim() : "";

    const asr = await getAsr(auth.user.clinicId);
    const pieces: string[] = kept ? [kept] : [];
    let model = consult.asrModel ?? "";
    let seconds = 0;
    for (const p of todo) {
      const result = await asr.transcribe(p.buf, p.filename);
      if (result.text) pieces.push(result.text);
      model = result.model;
      seconds += result.seconds;
    }

    // A blank line between parts, so the doctor can see where the recording
    // was stopped and picked up again.
    const text = pieces.join("\n\n");
    await setTranscript(auth.user.clinicId, id, text, model, seconds, parts.length);
    return NextResponse.json({ transcript: text, model, seconds, parts: parts.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
