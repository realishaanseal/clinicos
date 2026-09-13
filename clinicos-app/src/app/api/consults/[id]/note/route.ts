import { NextRequest, NextResponse } from "next/server";
import { getConsult, setDraft, previousSignedConsults } from "@/lib/db";
import { getLlm } from "@/lib/llm";
import { parseNote } from "@/lib/types";
import { requireApiUser } from "@/lib/auth";

export const maxDuration = 600;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const consult = getConsult(id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const transcript = (body.transcript ?? consult.transcript ?? "").trim();
  if (!transcript) return NextResponse.json({ error: "No transcript to work from" }, { status: 400 });

  // Prior visits, as context only. The prompt forbids carrying findings forward.
  const context = previousSignedConsults(consult.patientId, id)
    .map((p) => {
      const n = parseNote(p.finalJson);
      const meds = n.medications.map((m) => m.name).filter(Boolean).join(", ") || "none";
      return `${p.signedAt?.slice(0, 10)} — ${n.diagnosis || n.chiefComplaint || "(none recorded)"}; Rx: ${meds}`;
    })
    .join("\n");

  try {
    const result = await getLlm().generateNote(transcript, context || undefined);
    setDraft(id, transcript, JSON.stringify(result.note), result.model, result.seconds);
    return NextResponse.json({ note: result.note, model: result.model, seconds: result.seconds });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
