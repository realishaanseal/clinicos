import { NextRequest, NextResponse } from "next/server";
import { createConsult, getPatient } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const body = await req.json();
  const patientId = body.patientId as string;
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  if (!await getPatient(patientId)) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  return NextResponse.json({ consult: await createConsult(patientId, auth.user.id) });
}
