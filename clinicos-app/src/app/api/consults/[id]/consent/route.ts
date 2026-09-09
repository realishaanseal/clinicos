import { NextRequest, NextResponse } from "next/server";
import { getConsult, setConsent } from "@/lib/db";

// Consent is a precondition, not a checkbox. No other route in this app will
// accept audio for a consult until this has been set.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getConsult(id)) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  setConsent(id, body.by || "staff");
  return NextResponse.json({ ok: true });
}
