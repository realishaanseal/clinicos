import { NextRequest, NextResponse } from "next/server";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth";
import { normalisePhone, phoneHmac, portalReady } from "@/lib/portal-crypto";
import {
  PORTAL_ENABLED,
  acceptPortalTerms,
  acceptedTerms,
  clearPinFailures,
  getAccountByPhone,
  isLocked,
  noteWrongPin,
  noteWrongTry,
  patientCookie,
  startPatientSession,
  tooManyTries,
} from "@/lib/portal";
import { parseLang } from "@/lib/terms";

/** Phone number and PIN. An account from before the portal had terms is asked
 *  to accept them, once, before it opens. Errors carry a code, so the portal
 *  can say them in the patient's language. */
export async function POST(req: NextRequest) {
  if (!PORTAL_ENABLED || !portalReady()) {
    return NextResponse.json({ error: "Prescriptions online are not available here.", code: "unavailable" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const phone = normalisePhone(body.phone);
  const pin = String(body.pin ?? "");
  if (!phone || !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: "Enter your phone number and your 6-digit PIN.", code: "login-format" }, { status: 400 });
  }

  const ph = phoneHmac(phone);
  const account = await getAccountByPhone(ph);
  if ((await tooManyTries(ph)) || (account && isLocked(account))) {
    return NextResponse.json(
      { error: "Too many wrong tries. Wait 15 minutes, or use the code on your prescription to set a new PIN.", code: "locked" },
      { status: 429 }
    );
  }

  let ok = false;
  if (account) ok = await verifyPassword(pin, account.pinHash);
  else await burnPasswordCheck(pin);
  if (!account || !ok) {
    await noteWrongTry(ph);
    if (account) await noteWrongPin(account);
    return NextResponse.json({ error: "That phone number and PIN don't match.", code: "pin-mismatch" }, { status: 401 });
  }

  await clearPinFailures(account.id);
  if (!acceptedTerms(account)) {
    if (body.acceptTerms !== true) {
      return NextResponse.json(
        { error: "Tick the box to agree to the terms before you continue.", code: "terms", needTerms: true },
        { status: 409 }
      );
    }
    await acceptPortalTerms(account.id, parseLang(body.lang));
  }
  const res = NextResponse.json({ ok: true, redirect: "/p" });
  res.cookies.set(patientCookie(await startPatientSession(account.id), req.nextUrl.protocol === "https:"));
  return res;
}
