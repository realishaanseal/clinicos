import { NextResponse } from "next/server";
import { PATIENT_COOKIE, endPatientSession } from "@/lib/portal";

export async function POST() {
  await endPatientSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: PATIENT_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
