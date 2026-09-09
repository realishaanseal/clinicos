import { NextRequest, NextResponse } from "next/server";
import { createPatient, createConsult, searchPatients } from "@/lib/db";

export async function POST(req: NextRequest) {
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
  const consult = createConsult(patient.id);
  return NextResponse.json({ patient, consultId: consult.id });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  return NextResponse.json({ patients: searchPatients(q) });
}
