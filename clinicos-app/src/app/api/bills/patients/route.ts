import { NextRequest, NextResponse } from "next/server";
import { searchPatients } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/**
 * Finding a patient to bill. Whoever takes money may bill, including a clinic
 * admin who has no front-desk screens, so this is the billing capability's own
 * search: name, age, sex and phone, and nothing else.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiUser("billing");
  if (auth.denied) return auth.denied;
  const found = await searchPatients(auth.user.clinicId, req.nextUrl.searchParams.get("q") || "");
  return NextResponse.json({
    patients: found.slice(0, 20).map((p) => ({ id: p.id, name: p.name, age: p.age, sex: p.sex, phone: p.phone })),
  });
}
