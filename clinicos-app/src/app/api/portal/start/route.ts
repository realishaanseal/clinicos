import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/sql";
import { hashPassword } from "@/lib/auth";
import { codeHash, looksLikeCode, normalisePhone, phoneHmac, portalReady, sameHash } from "@/lib/portal-crypto";
import { PORTAL_ENABLED, noteWrongTry, patientCookie, setAccountPin, startPatientSession, tooManyTries } from "@/lib/portal";

/**
 * First sign-in, or a forgotten PIN: the phone number, a code printed on one of
 * the patient's prescriptions, and a new 6-digit PIN. The code must belong to a
 * visit shared with that same phone number.
 */
export async function POST(req: NextRequest) {
  if (!PORTAL_ENABLED || !portalReady()) {
    return NextResponse.json({ error: "Prescriptions online are not available here." }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const phone = normalisePhone(body.phone);
  const pin = String(body.pin ?? "");
  if (!phone) return NextResponse.json({ error: "Enter the phone number the clinic has for you." }, { status: 400 });
  if (!looksLikeCode(body.code)) {
    return NextResponse.json({ error: "Enter the 10-letter code printed on your prescription." }, { status: 400 });
  }
  if (!/^\d{6}$/.test(pin)) return NextResponse.json({ error: "Choose a PIN of 6 digits." }, { status: 400 });

  const ph = phoneHmac(phone);
  if (await tooManyTries(ph)) {
    return NextResponse.json({ error: "Too many tries. Wait 15 minutes and try again." }, { status: 429 });
  }

  const share = await q().get<{ id: string; phoneHmac: string | null }>(
    `SELECT id, "phoneHmac" FROM "PortalShare" WHERE "codeHash" = ? AND "revokedAt" IS NULL`,
    codeHash(body.code)
  );
  if (!share || !share.phoneHmac || !sameHash(share.phoneHmac, ph)) {
    await noteWrongTry(ph);
    return NextResponse.json({ error: "That phone number and code don't match. Check both and try again." }, { status: 401 });
  }

  const accountId = await setAccountPin(ph, await hashPassword(pin));
  // Using a code brings its visit back into the list, if the patient had removed it.
  await q().run(`UPDATE "PortalShare" SET "hiddenAt" = NULL WHERE id = ?`, share.id);

  const res = NextResponse.json({ ok: true, redirect: "/p" });
  res.cookies.set(patientCookie(await startPatientSession(accountId), req.nextUrl.protocol === "https:"));
  return res;
}
