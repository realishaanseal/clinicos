import { NextRequest, NextResponse } from "next/server";
import {
  countActiveAdmins,
  deleteSessionsForUser,
  getUserPublic,
  recordAudit,
  updateUser,
  type UserPatch,
} from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { cleanText, describeAccess, parseRole } from "@/lib/users";

/**
 * Change a person's details or access, or deactivate them.
 *
 * Two lockouts are refused outright: an admin removing their own access, and
 * removing access from the last active person who can manage the clinic. The
 * only way back from either would be the reset-password script at the laptop.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const target = getUserPublic(id);
  if (!target) return NextResponse.json({ error: "That person no longer exists." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: UserPatch = {};
  const changed: string[] = [];

  if (body.name !== undefined) {
    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Their name can't be empty." }, { status: 400 });
    if (name !== target.name) { patch.name = name; changed.push("name"); }
  }
  if (body.role !== undefined) {
    const role = parseRole(body.role);
    if (!role) return NextResponse.json({ error: "Choose what they do here." }, { status: 400 });
    if (role !== target.role) { patch.role = role; changed.push("role"); }
  }
  if (body.isAdmin !== undefined && !!body.isAdmin !== !!target.isAdmin) {
    patch.isAdmin = !!body.isAdmin;
    changed.push("admin access");
  }
  if (body.qualification !== undefined) {
    const q = cleanText(body.qualification) || null;
    if (q !== target.qualification) { patch.qualification = q; changed.push("qualification"); }
  }
  if (body.regNo !== undefined) {
    const r = cleanText(body.regNo, 60) || null;
    if (r !== target.regNo) { patch.regNo = r; changed.push("registration number"); }
  }
  if (body.active !== undefined && !!body.active !== !!target.active) {
    patch.active = !!body.active;
    changed.push(body.active ? "reactivated" : "deactivated");
  }

  if (changed.length === 0) return NextResponse.json({ ok: true });

  const role = patch.role ?? target.role;
  const willManage = role === "admin" || (role === "doctor" && (patch.isAdmin ?? !!target.isAdmin));
  const willBeActive = patch.active ?? !!target.active;
  const managesNow = !!target.active && !!target.isAdmin;
  const losesAccess = patch.role !== undefined || !willManage || !willBeActive;

  if (target.id === auth.user.id && losesAccess) {
    return NextResponse.json(
      { error: "You can't change your own access or deactivate yourself. Ask another admin to do it." },
      { status: 400 }
    );
  }
  if (managesNow && (!willManage || !willBeActive) && countActiveAdmins() <= 1) {
    return NextResponse.json(
      { error: "This is the only person who can manage the clinic. Give someone else that access first." },
      { status: 400 }
    );
  }

  updateUser(id, patch);
  // A deactivated account is signed out everywhere at once. Other changes take
  // effect on the next request, because permissions are read fresh every time.
  if (patch.active === false) deleteSessionsForUser(id);

  const after = getUserPublic(id)!;
  recordAudit(
    auth.user,
    "user_update",
    "user",
    id,
    `${after.name}: ${changed.join(", ")} (now ${describeAccess(after.role, !!after.isAdmin)})`
  );
  return NextResponse.json({ ok: true });
}
