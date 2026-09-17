"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Mark, IcPulse, IcUsers, IcShield, IcCog, IcDoc } from "./Icons";
import { describeAccess, type Role } from "@/lib/users";
import { ONLINE } from "@/lib/deployment";
import { appPath } from "@/lib/base-path";

type NavUser = { name: string; role: Role; isAdmin: boolean };

/**
 * Links are shown by role so nobody is offered a door they cannot open. This
 * is convenience only — every page and route checks permission itself.
 */
export default function SideNav({ user, clinicName }: { user: NavUser; clinicName: string }) {
  const path = usePathname();
  const [leaving, setLeaving] = useState(false);

  const frontdesk = user.role !== "admin";
  const admin = user.role === "admin" || user.isAdmin;

  const links = [
    frontdesk && { href: "/", label: "Today", icon: <IcPulse size={17} /> },
    frontdesk && { href: "/patients", label: "Patients", icon: <IcUsers size={17} /> },
    admin && { href: "/admin", label: "Clinic admin", icon: <IcCog size={17} /> },
    admin && { href: "/admin/users", label: "People", icon: <IcShield size={17} /> },
    admin && { href: "/admin/audit", label: "Activity log", icon: <IcDoc size={17} /> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];

  // The most specific matching link is the active one, so /admin/users does not
  // also light up "Clinic admin".
  const activeHref = links
    .map((l) => l.href)
    .filter((h) => (h === "/" ? path === "/" : path === h || path.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];

  async function signOut() {
    setLeaving(true);
    try {
      await fetch(appPath("/api/auth/logout"), { method: "POST" });
    } finally {
      // A full navigation, so the layout re-renders without the signed-in shell.
      window.location.assign(appPath("/login"));
    }
  }

  const home = links[0]?.href ?? "/account/password";

  return (
    <>
      <nav className="sidenav noprint" aria-label="Main">
        <Link href={home} className="brand">
          <span className="mark">
            <Mark size={19} />
          </span>
          <span className="stack">
            <span className="name">ClinicOS</span>
            <span className="tag" title={clinicName}>{clinicName}</span>
          </span>
        </Link>

        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`navlink ${activeHref === l.href ? "active" : ""}`}>
            {l.icon} {l.label}
          </Link>
        ))}

        <div className="nav-foot">
          <div className="privacy">
            <IcShield size={15} />
            {ONLINE ? (
              <span>
                <strong>Online prototype</strong>
                Use made-up patients only. Audio is deleted when you sign.
              </span>
            ) : (
              <span>
                <strong>Running locally</strong>
                Consultation audio never leaves this machine, and is deleted when you sign.
              </span>
            )}
          </div>

          <div className="whoami">
            <span className="who">
              <strong>{user.name}</strong>
              {describeAccess(user.role, user.isAdmin)}
            </span>
            <span className="acts">
              <Link href="/account/password">Password</Link>
              <button type="button" onClick={signOut} disabled={leaving}>
                {leaving ? "Signing out…" : "Sign out"}
              </button>
            </span>
          </div>
        </div>
      </nav>

      {/* The side navigation is hidden on narrow screens, which left a front-desk
          tablet with no way to move around or sign out. */}
      <nav className="topnav noprint" aria-label="Main">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={activeHref === l.href ? "active" : ""}>
            {l.label}
          </Link>
        ))}
        <span className="spacer" />
        <button type="button" onClick={signOut} disabled={leaving}>
          Sign out
        </button>
      </nav>
    </>
  );
}
