"use client";

/**
 * Scroll reveal.
 *
 * Where the browser supports scroll-driven animations, this does nothing at
 * runtime — the `[data-reveal]` rule in globals.css handles it in pure CSS, off
 * the main thread. Firefox has no support, so there we attach an
 * IntersectionObserver instead.
 *
 * The `@supports` test checks `animation-range` as well as `animation-timeline`,
 * because some browsers ship partial support and would otherwise take the
 * native path and never animate.
 *
 * If everything fails, content is simply visible. Nothing here is load-bearing.
 */

import { useEffect, useRef, type ReactNode } from "react";

const NATIVE_SUPPORT =
  "(animation-timeline: view()) and (animation-range: entry)";

export default function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger, in ms. Only applies on the JS fallback path. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Native path and reduced-motion path both need nothing from us.
    if (typeof CSS !== "undefined" && CSS.supports?.(NATIVE_SUPPORT)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    el.classList.add("js-reveal");
    if (delay) el.style.transitionDelay = `${delay}ms`;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target); // reveal once, don't re-hide on scroll up
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  return (
    <div ref={ref} data-reveal className={className}>
      {children}
    </div>
  );
}
