import { NextRequest, NextResponse } from "next/server";
import { favouriteView, listFavourites, saveFavourite, MAX_FAVOURITES } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { planOf, planHasContent } from "@/lib/types";

/**
 * A doctor's own saved prescriptions. Every call works on the signed-in
 * doctor's favourites only: the account comes from the session, never from
 * the request, so one doctor can neither read nor change another's.
 */
export async function GET() {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;
  return NextResponse.json({ favourites: (await listFavourites(auth.user.id)).map(favouriteView) });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("clinical");
  if (auth.denied) return auth.denied;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) return NextResponse.json({ error: "Give the favourite a name, like “Viral fever — adult”." }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Keep the name under 80 characters." }, { status: 400 });

  // Only the plan is kept, whatever else was sent.
  const plan = planOf(body.plan ?? body.note);
  if (!planHasContent(plan)) {
    return NextResponse.json({ error: "There is nothing to save yet: add a diagnosis, a medicine, a test or advice first." }, { status: 400 });
  }

  const saved = await saveFavourite(auth.user.id, name, JSON.stringify(plan));
  if (!saved) {
    return NextResponse.json({ error: `You already have ${MAX_FAVOURITES} favourites. Delete one you no longer use first.` }, { status: 409 });
  }
  return NextResponse.json({ favourite: favouriteView(saved.favourite), replaced: saved.replaced });
}
