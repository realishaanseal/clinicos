import { NextRequest, NextResponse } from "next/server";
import { deleteFavourite } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/** Delete one of the signed-in doctor's own favourites. Another doctor's, or
 *  one that does not exist, is the same 404: nothing says which it was. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;
  const { id } = await params;
  if (!(await deleteFavourite(id, auth.user.id))) {
    return NextResponse.json({ error: "That favourite isn't there any more." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
