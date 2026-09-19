import { NextRequest, NextResponse } from "next/server";
import { getConsult, setAudio } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { writeWhole } from "@/lib/audio-store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const consult = await getConsult(auth.user.clinicId, id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });

  // Hard gate. Without recorded consent there is no lawful basis to store this.
  if (!consult.consentGiven) {
    return NextResponse.json({ error: "Consent has not been recorded for this consultation." }, { status: 403 });
  }
  if (consult.signedAt) {
    return NextResponse.json({ error: "This consultation is already signed." }, { status: 409 });
  }

  const form = await req.formData();
  const file = form.get("audio") as File | null;
  if (!file) return NextResponse.json({ error: "No audio supplied" }, { status: 400 });

  const seconds = Number(form.get("seconds") || 0);
  const ext = file.type.includes("mp4") ? "mp4" : file.type.includes("ogg") ? "ogg" : "webm";
  const buf = Buffer.from(await file.arrayBuffer());
  const audioPath = await writeWhole(id, buf, ext);

  await setAudio(auth.user.clinicId, id, audioPath, buf.length, seconds || null);
  return NextResponse.json({ ok: true, bytes: buf.length });
}
