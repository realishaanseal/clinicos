import { NextRequest, NextResponse } from "next/server";
import { recordAudit, recordRecall, type RecallAction } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/** The desk messaged the patient about a due follow-up, or decided it was not
 *  needed. Either way it leaves the list. The id is the signed visit's. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("frontdesk");
  if (auth.denied) return auth.denied;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const action: RecallAction | null = body.action === "messaged" || body.action === "dismissed" ? body.action : null;
  if (!action) return NextResponse.json({ error: "Say whether the patient was messaged or it is not needed." }, { status: 400 });

  if (!(await recordRecall(auth.user.clinicId, id, action, auth.user.id))) {
    return NextResponse.json({ error: "That visit isn't on file." }, { status: 404 });
  }
  await recordAudit(auth.user.clinicId, auth.user, `followup_${action}`, "consult", id);
  return NextResponse.json({ ok: true });
}
