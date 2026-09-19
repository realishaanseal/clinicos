import { NextResponse } from "next/server";
import { getBill } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/** One bill, as the receipt shows it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("billing");
  if (auth.denied) return auth.denied;
  const { id } = await params;
  const bill = await getBill(auth.user.clinicId, id);
  if (!bill) return NextResponse.json({ error: "That bill isn't on file." }, { status: 404 });
  return NextResponse.json({ bill });
}
