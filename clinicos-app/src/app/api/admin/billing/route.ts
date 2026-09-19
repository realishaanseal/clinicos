import { NextRequest, NextResponse } from "next/server";
import { recordAudit, setSettings } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import { MAX_RECALL_MESSAGE } from "@/lib/recall";

/**
 * The clinic's consultation fee, which starts every new bill, and the words of
 * the follow-up reminder. Both are clinic_ settings, so they reach a connected
 * clinic computer too.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const body = await req.json().catch(() => ({}));
  const values: Record<string, string> = {};
  const said: string[] = [];

  if (body.fee !== undefined) {
    const raw = String(body.fee ?? "").trim();
    const fee = raw === "" ? 0 : rupeesToPaise(raw);
    if (fee === null) return NextResponse.json({ error: "Enter the fee in rupees, such as 300." }, { status: 400 });
    values.clinic_fee = fee ? String(fee) : "";
    said.push(fee ? `consultation fee ${formatPaise(fee)}` : "no consultation fee");
  }
  if (body.recallMessage !== undefined) {
    const text = String(body.recallMessage ?? "").trim();
    if (text.length > MAX_RECALL_MESSAGE) {
      return NextResponse.json({ error: `Keep the message under ${MAX_RECALL_MESSAGE} characters.` }, { status: 400 });
    }
    values.clinic_recall_message = text;
    said.push(text ? "follow-up message changed" : "follow-up message back to the default");
  }
  if (!said.length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  await setSettings(auth.user.clinicId, values);
  await recordAudit(auth.user.clinicId, auth.user, "settings_update", "clinic", null, said.join(", "));
  return NextResponse.json({ ok: true });
}
