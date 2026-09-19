import { NextResponse } from "next/server";
import { q } from "@/lib/sql";
import { getCurrentPatient } from "@/lib/portal";

/** The patient removes a visit from their own list. The clinic's record is not
 *  touched; using that visit's code again brings it back. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const patient = await getCurrentPatient();
  if (!patient) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { id } = await params;
  const { changes } = await q().run(
    `UPDATE "PortalShare" SET "hiddenAt" = ? WHERE id = ? AND "phoneHmac" = ? AND "hiddenAt" IS NULL`,
    new Date().toISOString(), id, patient.phoneHmac
  );
  if (!changes) return NextResponse.json({ error: "That prescription isn't in your list." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
