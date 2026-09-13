import { NextResponse } from "next/server";
import { markQueueLeft } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/** The patient went home without being seen. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("frontdesk");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  if (!markQueueLeft(id)) {
    return NextResponse.json(
      { error: "Only a patient who is still waiting can be marked as gone." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
