import { NextRequest, NextResponse } from "next/server";
import { markFavouriteUsed } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/** Counts a use, so the doctor's everyday favourites sort to the top. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;
  const { id } = await params;
  if (!(await markFavouriteUsed(id, auth.user.id))) {
    return NextResponse.json({ error: "That favourite isn't there any more." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
