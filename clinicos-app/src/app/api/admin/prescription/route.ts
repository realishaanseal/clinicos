import { NextRequest, NextResponse } from "next/server";
import { recordAudit, setSettings } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { CARD_LANGUAGES, parseCardLanguage } from "@/lib/rx-card";

/** How the clinic's prescriptions print: the medicine timing card's language,
 *  or none. The logo has its own route. */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const body = await req.json().catch(() => ({}));
  const lang = body.cardLanguage === "off" || body.cardLanguage === "" ? "" : parseCardLanguage(body.cardLanguage);
  if (lang === null) return NextResponse.json({ error: "Choose a language for the card, or none." }, { status: 400 });
  await setSettings(auth.user.clinicId, { rx_card_language: lang });
  await recordAudit(auth.user.clinicId, auth.user, "settings_update", "clinic", null, lang ? `timing card in ${CARD_LANGUAGES[lang]}` : "no timing card");
  return NextResponse.json({ ok: true });
}
