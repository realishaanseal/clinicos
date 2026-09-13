import { NextRequest, NextResponse } from "next/server";
import { addToQueue, getPatient, todaysQueue } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/** Today's list. Names, ages and phone numbers only — nothing clinical. */
export async function GET() {
  const auth = await requireApiUser("frontdesk");
  if (auth.denied) return auth.denied;
  return NextResponse.json({ queue: todaysQueue() });
}

/** Add an existing patient to today's list. */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("frontdesk");
  if (auth.denied) return auth.denied;

  const body = await req.json().catch(() => ({}));
  const patient = getPatient(String(body.patientId ?? ""));
  if (!patient) return NextResponse.json({ error: "That patient isn't on file." }, { status: 404 });

  const { entry, alreadyQueued } = addToQueue(patient.id, auth.user.id);
  return NextResponse.json({
    entry: { id: entry.id, token: entry.token, status: entry.status },
    patientName: patient.name,
    alreadyQueued,
  });
}
