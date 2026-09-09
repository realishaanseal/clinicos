import { NextRequest, NextResponse } from "next/server";
import { createConsult } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const patientId = body.patientId as string;
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  return NextResponse.json({ consult: createConsult(patientId) });
}
