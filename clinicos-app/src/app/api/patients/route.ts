import { NextRequest, NextResponse } from "next/server";
import { createPatient, createConsult, searchPatients } from "@/lib/db";
import { can, requireApiUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("frontdesk");
  if (auth.denied) return auth.denied;

  const body = await req.json();
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const ageNum = body.age === "" || body.age == null ? null : Number(body.age);
  const patient = createPatient({
    name,
    age: Number.isFinite(ageNum as number) ? (ageNum as number) : null,
    sex: body.sex || null,
    phone: body.phone || null,
    guardianName: body.guardianName || null,
  });

  // Only a doctor goes straight from registration into a consultation.
  const consult = can(auth.user, "clinical") ? createConsult(patient.id, auth.user.id) : null;
  return NextResponse.json({ patient, consultId: consult?.id ?? null });
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser("frontdesk");
  if (auth.denied) return auth.denied;

  const q = req.nextUrl.searchParams.get("q") || "";
  return NextResponse.json({ patients: searchPatients(q) });
}
