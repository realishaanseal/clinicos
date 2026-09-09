"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark, IcPulse, IcUsers, IcShield, IcCog } from "./Icons";

export default function SideNav() {
  const path = usePathname();
  const on = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));

  return (
    <nav className="sidenav noprint">
      <Link href="/" className="brand">
        <span className="mark">
          <Mark size={19} />
        </span>
        <span className="stack">
          <span className="name">ClinicOS</span>
          <span className="tag">Krishnanagar</span>
        </span>
      </Link>

      <Link href="/" className={`navlink ${on("/") ? "active" : ""}`}>
        <IcPulse size={17} /> Today
      </Link>
      <Link href="/patients" className={`navlink ${on("/patients") ? "active" : ""}`}>
        <IcUsers size={17} /> Patients
      </Link>

      <Link href="/settings" className={`navlink ${on("/settings") ? "active" : ""}`}>
        <IcCog size={17} /> Settings
      </Link>

      <div className="nav-foot">
        <div className="privacy">
          <IcShield size={15} />
          <span>
            <strong>Running locally</strong>
            Consultation audio never leaves this machine, and is deleted when you sign.
          </span>
        </div>
      </div>
    </nav>
  );
}
