import { requireUser } from "@/lib/auth";
import { listUsers } from "@/lib/db";
import UsersAdmin from "@/components/UsersAdmin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requireUser("admin");
  const users = listUsers().map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    isAdmin: !!u.isAdmin,
    qualification: u.qualification,
    regNo: u.regNo,
    active: !!u.active,
    mustChangePassword: !!u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Clinic admin</div>
        <h1>People</h1>
        <p className="sub">Everyone who can sign in to ClinicOS here, and what each of them can open.</p>
      </div>
      <UsersAdmin users={users} currentUserId={user.id} />
    </div>
  );
}
