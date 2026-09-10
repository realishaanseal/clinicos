"use client";

/**
 * Counts a figure up when it scrolls into view. Non-numeric parts of the label
 * (a "~", a "½", an en-dash range) are passed through untouched, so a value like
 * "48s" animates its number and keeps its unit.
 *
 * Under reduced motion the final value renders immediately.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

export default function CountUp({ value }: { value: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(reduced ? value : null);

  useEffect(() => {
    if (reduced) { setShown(value); return; }
    const el = ref.current;
    if (!el) return;

    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) { setShown(value); return; }

    const target = parseFloat(match[0]);
    const decimals = (match[0].split(".")[1] ?? "").length;

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const start = performance.now();
        const dur = 1100;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / dur);
          // easeOutExpo — fast then settling, so the number lands rather than crawls
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          const n = (target * eased).toFixed(decimals);
          setShown(value.replace(match[0], n));
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.4 });

    io.observe(el);
    return () => io.disconnect();
  }, [value, reduced]);

  return <span ref={ref}>{shown ?? value.replace(/-?\d+(\.\d+)?/, "0")}</span>;
}
