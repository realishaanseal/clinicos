import Link from "next/link";
import { Mark } from "@/components/Icons";

/**
 * An address that leads nowhere: a deleted patient, an old bookmark, a typo.
 * Plain words, and a way back — a doctor mid-consultation should never meet a
 * stack trace.
 */
export default function NotFound() {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="mark">
            <Mark size={21} />
          </span>
          <div>
            <div className="name">ClinicOS</div>
            <div className="tag">Not found</div>
          </div>
        </div>
        <h1>That page isn&apos;t here</h1>
        <p className="sub">
          The address may be old, or the record may have been deleted. Nothing that was saved has been lost.
        </p>
        <Link className="btn wide" href="/" style={{ justifyContent: "center" }}>
          Back to Today
        </Link>
      </div>
    </main>
  );
}
