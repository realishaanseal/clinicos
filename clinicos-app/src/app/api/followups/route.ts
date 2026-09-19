import { NextResponse } from "next/server";
import { followUpsDue, localDay, RECALL_DAYS } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { clinicDayAt } from "@/lib/time";

/** Patients whose date to come back has arrived and who have not been back:
 *  names, phone numbers, dates and the doctor. Never why they were seen. */
export async function GET() {
  const auth = await requireApiUser("frontdesk");
  if (auth.denied) return auth.denied;
  const due = await followUpsDue(auth.user.clinicId, localDay(), localDay(clinicDayAt(-RECALL_DAYS)));
  return NextResponse.json({ due });
}
