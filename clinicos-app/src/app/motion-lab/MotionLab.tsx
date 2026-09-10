"use client";

/**
 * Motion smoke test — proves motion, GSAP, Lenis and React Three Fiber are all
 * installed, importable and animating in this Next.js 15 / React 19 app.
 *
 * This is a development harness, not a product surface. It lives outside the
 * clinical routes on purpose. See .claude/skills/clinicos-motion/SKILL.md for
 * where each of these libraries is and is not allowed.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import gsap from "gsap";
import dynamic from "next/dynamic";

const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => <div className="lab-scene-fallback">loading scene…</div>,
});

const ROWS = ["Ananya Das", "Rahul Mondal", "Sufia Begum", "Tapan Ghosh"];

export default function MotionLab() {
  const reduced = useReducedMotion();
  const [rows, setRows] = useState(ROWS);
  const [open, setOpen] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);
  const [lenisOk, setLenisOk] = useState<string>("checking…");

  // --- GSAP -----------------------------------------------------------------
  useEffect(() => {
    if (reduced || !barRef.current) return;
    const ctx = gsap.context(() => {
      gsap.to(".lab-bar i", {
        scaleY: () => 0.3 + Math.random() * 0.7,
        duration: 0.45,
        ease: "sine.inOut",
        stagger: { each: 0.06, repeat: -1, yoyo: true },
        transformOrigin: "bottom",
      });
    }, barRef);
    return () => ctx.revert();
  }, [reduced]);

  // --- Lenis ----------------------------------------------------------------
  // Only imported to confirm it resolves. It is deliberately NOT started:
  // hijacking scroll is banned on every surface a doctor touches.
  useEffect(() => {
    let cancelled = false;
    import("lenis")
      .then((m) => !cancelled && setLenisOk(`ok — Lenis v${(m.default as unknown as { version?: string }).version ?? "loaded"}`))
      .catch((e) => !cancelled && setLenisOk(`failed: ${e.message}`));
    return () => { cancelled = true; };
  }, []);

  const spring = { type: "spring" as const, stiffness: 400, damping: 34 };

  return (
    <div className="lab">
      <section className="card">
        <div className="card-head"><span className="title">motion — layout &amp; presence</span></div>
        <div className="card-body">
          <div className="lab-actions">
            <button className="btn" onClick={() => setRows((r) => [...r].reverse())}>Reorder</button>
            <button className="btn" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Show"} panel</button>
          </div>
          <ul className="lab-rows">
            {rows.map((name) => (
              <motion.li key={name} layout transition={reduced ? { duration: 0 } : spring} className="lab-row">
                {name}
              </motion.li>
            ))}
          </ul>
          <AnimatePresence>
            {open && (
              <motion.div
                className="lab-panel"
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.3, 1] }}
              >
                Enter/exit via AnimatePresence. Reduced motion is {reduced ? "ON — animation suppressed" : "off"}.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><span className="title">GSAP — timeline</span></div>
        <div className="card-body">
          <div className="lab-bar" ref={barRef}>
            {Array.from({ length: 18 }).map((_, i) => <i key={i} />)}
          </div>
          <p className="lab-note">Staggered repeating timeline. Suppressed entirely under reduced motion.</p>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><span className="title">React Three Fiber — WebGL</span></div>
        <div className="card-body">
          <div className="lab-scene"><Scene still={!!reduced} /></div>
          <p className="lab-note">Client-only dynamic import, capped DPR. Lenis: {lenisOk}</p>
        </div>
      </section>
    </div>
  );
}
