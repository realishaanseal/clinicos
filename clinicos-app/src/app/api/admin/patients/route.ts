import { NextRequest, NextResponse } from "next/server";
import { searchPatients } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/**
 * Finding a patient to export or delete, for whoever manages the clinic.
 * Clinic admin's own search: a clinic with thousands of records cannot be
 * served by a list of the fifty most recent, and an erasure request names
 * somebody who may have been registered years ago.
 *
 * Names and how many visits they have — never a note, a diagnosis or a
 * prescription, because a clinic admin has no clinical access.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const found = await searchPatients(auth.user.clinicId, req.nextUrl.searchParams.get("q") || "");
  return NextResponse.json({
    patients: found.map((p) => ({ id: p.id, name: p.name, consultCount: p.consultCount })),
  });
}
