import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByUsername, recordAudit } from "@/lib/db";
import { generateTempPassword, hashPassword, requireApiUser } from "@/lib/auth";
import { cleanText, cleanUsername, describeAccess, parseRole, USERNAME_RULE } from "@/lib/users";

/**
 * Add a person. The admin never chooses their password: ClinicOS makes a
 * temporary one, shows it once, and the person must replace it at first sign-in.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;

  const body = await req.json().catch(() => ({}));
  const name = cleanText(body.name);
  const username = cleanUsername(body.username);
  const role = parseRole(body.role);

  if (!name) return NextResponse.json({ error: "Enter their full name." }, { status: 400 });
  if (!username) return NextResponse.json({ error: `Usernames are ${USERNAME_RULE}.` }, { status: 400 });
  if (!role) return NextResponse.json({ error: "Choose what they do here." }, { status: 400 });
  if (await getUserByUsername(auth.user.clinicId, username)) {
    return NextResponse.json({ error: "That username is already taken. Pick another." }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  let user;
  try {
    user = await createUser(auth.user.clinicId, {
      name,
      username,
      role,
      isAdmin: !!body.isAdmin,
      passwordHash: await hashPassword(tempPassword),
      qualification: role === "doctor" ? cleanText(body.qualification) || null : null,
      regNo: role === "doctor" ? cleanText(body.regNo, 60) || null : null,
      mustChangePassword: true,
    });
  } catch {
    // Two admins adding the same username at the same moment: the UNIQUE
    // constraint catches what the check above could not.
    return NextResponse.json({ error: "That username is already taken. Pick another." }, { status: 409 });
  }

  await recordAudit(auth.user.clinicId, auth.user, "user_create", "user", user.id, `${user.name}, ${describeAccess(user.role, !!user.isAdmin)}`);
  return NextResponse.json({
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
    tempPassword,
  });
}
