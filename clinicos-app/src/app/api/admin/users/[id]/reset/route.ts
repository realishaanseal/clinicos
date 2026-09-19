import { NextResponse } from "next/server";
import { deleteSessionsForUser, getUserPublic, recordAudit, setUserPassword } from "@/lib/db";
import { generateTempPassword, hashPassword, requireApiUser } from "@/lib/auth";

/** Replace someone's password with a temporary one and sign them out everywhere. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const target = await getUserPublic(auth.user.clinicId, id);
  if (!target) return NextResponse.json({ error: "That person no longer exists." }, { status: 404 });
  if (target.id === auth.user.id) {
    return NextResponse.json(
      { error: "Change your own password from Password, at the bottom of the menu." },
      { status: 400 }
    );
  }

  const tempPassword = generateTempPassword();
  await setUserPassword(auth.user.clinicId, id, await hashPassword(tempPassword), true);
  await deleteSessionsForUser(id);
  await recordAudit(auth.user.clinicId, auth.user, "user_password_reset", "user", id, target.name);

  return NextResponse.json({ ok: true, tempPassword });
}
