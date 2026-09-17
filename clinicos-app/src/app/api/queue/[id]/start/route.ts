import { NextResponse } from "next/server";
import { startQueueEntry } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/** A doctor calls a waiting patient in. Returns the consultation to open. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const entry = await startQueueEntry(id, auth.user.id);
  if (!entry || !entry.consultId) {
    return NextResponse.json(
      { error: "This patient is no longer waiting. Another doctor may already have called them in." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, consultId: entry.consultId });
}
