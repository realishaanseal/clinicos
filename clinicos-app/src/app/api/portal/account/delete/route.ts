import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/sql";
import { PATIENT_COOKIE, getCurrentPatient } from "@/lib/portal";

/**
 * The patient deletes their account: their PIN and sign-ins go, and every
 * visit leaves their list. The clinics keep their own records, as the law
 * requires; a code from a prescription can start a new account later.
 * Typed confirmation, as for anything that cannot be undone.
 */
export async function POST(req: NextRequest) {
  const patient = await getCurrentPatient();
  if (!patient) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (String(body.confirm ?? "").trim().toUpperCase() !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm. Nothing was changed." }, { status: 400 });
  }
  await q().run(`UPDATE "PortalShare" SET "hiddenAt" = ? WHERE "phoneHmac" = ? AND "hiddenAt" IS NULL`, new Date().toISOString(), patient.phoneHmac);
  await q().run(`DELETE FROM "PortalAccount" WHERE id = ?`, patient.id); // sign-ins go with it
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: PATIENT_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
