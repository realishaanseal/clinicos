import MotionLab from "./MotionLab";
import "./lab.css";

export const metadata = { title: "Motion lab — ClinicOS" };

/**
 * Development harness only. Confirms the animation stack is wired correctly
 * without putting any of it on a screen a doctor uses. Safe to delete.
 */
export default function Page() {
  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="eyebrow">Development only</div>
        <h1>Motion lab</h1>
        <p className="sub">
          Smoke test for motion, GSAP, Lenis and React Three Fiber. Not a product surface —
          see <code>.claude/skills/clinicos-motion/SKILL.md</code> for where each belongs.
        </p>
      </div>
      <MotionLab />
    </div>
  );
}
