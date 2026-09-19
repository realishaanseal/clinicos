"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Mark, IcUsers, IcDoc, IcShield } from "./Icons";
import { appPath } from "@/lib/base-path";

/** The platform console's navigation. Deliberately a different set of links
 *  from a clinic's: nothing here leads to a patient. */
export default function PlatformNav({ name }: { name: string }) {
  const path = usePathname();
  const [leaving, setLeaving] = useState(false);

  const links = [
    { href: "/platform", label: "Clinics", icon: <IcUsers size={17} /> },
    { href: "/platform/activity", label: "Activity", icon: <IcDoc size={17} /> },
  ];
  const active = (href: string) =>
    href === "/platform" ? path === "/platform" || path.startsWith("/platform/clinics") : path.startsWith(href);

  async function signOut() {
    setLeaving(true);
    try {
      await fetch(appPath("/api/platform/logout"), { method: "POST" });
    } finally {
      window.location.assign(appPath("/platform/login"));
    }
  }

  return (
    <>
      <nav className="sidenav noprint" aria-label="Platform">
        <Link href="/platform" className="brand">
          <span className="mark">
            <Mark size={19} />
          </span>
          <span className="stack">
            <span className="name">ClinicOS</span>
            <span className="tag">Varaxis platform</span>
          </span>
        </Link>

        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`navlink ${active(l.href) ? "active" : ""}`}>
            {l.icon} {l.label}
          </Link>
        ))}

        <div className="nav-foot">
          <div className="privacy">
            <IcShield size={15} />
            <span>
              <strong>No patient records here</strong>
              The console sets clinics up and shows counts. It cannot open a clinic&apos;s records.
            </span>
          </div>
          <div className="whoami">
            <span className="who">
              <strong>{name}</strong>
              Varaxis operator
            </span>
            <span className="acts">
              <Link href="/platform/password">Password</Link>
              <button type="button" onClick={signOut} disabled={leaving}>
                {leaving ? "Signing out…" : "Sign out"}
              </button>
            </span>
          </div>
        </div>
      </nav>

      <nav className="topnav noprint" aria-label="Platform">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={active(l.href) ? "active" : ""}>
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
