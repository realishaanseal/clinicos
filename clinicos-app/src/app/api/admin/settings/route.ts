import { NextRequest, NextResponse } from "next/server";
import { recordAudit, setSettings } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { cleanText } from "@/lib/users";

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;

  const body = await req.json().catch(() => ({}));
  const name = cleanText(body.name);
  if (!name) return NextResponse.json({ error: "The clinic needs a name." }, { status: 400 });

  await setSettings(auth.user.clinicId, {
    clinic_name: name,
    clinic_address: cleanText(body.address, 300),
    clinic_phone: cleanText(body.phone, 40),
  });
  await recordAudit(auth.user.clinicId, auth.user, "settings_update", "clinic");
  return NextResponse.json({ ok: true });
}
