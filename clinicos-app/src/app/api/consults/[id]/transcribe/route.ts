import { NextRequest, NextResponse } from "next/server";
import { getConsult, setTranscript } from "@/lib/db";
import { getAsr } from "@/lib/asr";
import { readFile } from "fs/promises";
import path from "path";

export const maxDuration = 600;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const consult = getConsult(id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  if (!consult.audioPath) return NextResponse.json({ error: "No audio recorded yet" }, { status: 400 });

  try {
    const buf = await readFile(consult.audioPath);
    const result = await getAsr().transcribe(buf, path.basename(consult.audioPath));
    setTranscript(id, result.text, result.model, result.seconds);
    return NextResponse.json({ transcript: result.text, model: result.model, seconds: result.seconds });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
