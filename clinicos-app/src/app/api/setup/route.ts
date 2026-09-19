import { NextRequest, NextResponse } from "next/server";
import { createFirstAccount, recordAudit } from "@/lib/db";
import { hashPassword, homeFor, sessionCookie, startSession, toSessionUser } from "@/lib/auth";
import { cleanText, cleanUsername, passwordProblem, USERNAME_RULE } from "@/lib/users";
import { setupCodeMatches } from "@/lib/setup-code";
import { CLINIC_COOKIE, MULTI_CLINIC, resolveClinic } from "@/lib/tenant";

/**
 * First run only. Creates a clinic's owner account while that clinic has no
 * accounts and refuses forever after. Anyone who can reach the laptop before
 * setup is done could claim it, so setup belongs on the first day the app is
 * switched on.
 *
 * Online, "anyone who can reach it" is the whole internet, so there setup also
 * needs a code. A clinic Varaxis creates gets its own one-time code, given to
 * the person setting the clinic up. The first clinic online uses SETUP_CODE
 * from the server's environment; with no code configured, online setup is
 * refused outright rather than left open.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const clinicSlug = typeof body.clinic === "string" && body.clinic.trim() ? body.clinic.trim() : null;
  const clinic = await resolveClinic(clinicSlug);
  if (!clinic) {
    return NextResponse.json({ error: "There is no clinic with that ID. Check the setup link Varaxis sent." }, { status: 404 });
  }

  if (!setupCodeMatches(clinic, body.setupCode)) {
    return NextResponse.json(
      {
        error:
          clinic.setupCodeHash || process.env.SETUP_CODE
            ? "That setup code isn't right."
            : "Setup is switched off until a setup code is configured on the server.",
      },
      { status: 403 }
    );
  }

  const clinicName = cleanText(body.clinicName);
  const name = cleanText(body.name);
  const username = cleanUsername(body.username);
  const password = String(body.password ?? "");
  const isDoctor = body.isDoctor !== false;

  if (!clinicName) return NextResponse.json({ error: "Enter the clinic's name." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!username) return NextResponse.json({ error: `Usernames are ${USERNAME_RULE}.` }, { status: 400 });
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const user = await createFirstAccount(
    clinic.id,
    {
      name,
      username,
      role: isDoctor ? "doctor" : "admin",
      isAdmin: true,
      passwordHash: await hashPassword(password),
      qualification: isDoctor ? cleanText(body.qualification) || null : null,
      regNo: isDoctor ? cleanText(body.regNo, 60) || null : null,
      mustChangePassword: false,
    },
    clinicName
  );

  if (!user) {
    return NextResponse.json({ error: "ClinicOS is already set up for this clinic. Sign in instead." }, { status: 409 });
  }

  const token = await startSession(user.id);
  await recordAudit(clinic.id, user, "setup", "user", user.id);

  const secure = req.nextUrl.protocol === "https:";
  const res = NextResponse.json({ ok: true, redirect: homeFor(toSessionUser(user, clinic.status)) });
  res.cookies.set(sessionCookie(token, secure));
  if (MULTI_CLINIC) {
    res.cookies.set({ name: CLINIC_COOKIE, value: clinic.slug, httpOnly: true, sameSite: "lax", path: "/", maxAge: 400 * 24 * 60 * 60, secure });
  }
  return res;
}
