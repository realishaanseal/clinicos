"use client";

/**
 * Lenis smooth scroll, driven by GSAP's ticker and wired into ScrollTrigger.
 *
 * The two must share one clock. If Lenis runs its own RAF loop while
 * ScrollTrigger runs on GSAP's, scroll-linked animations lag the real scroll
 * position by a frame or two and the whole page feels loose. So: Lenis's raf is
 * called from gsap.ticker, lagSmoothing is off, and ScrollTrigger.update runs on
 * every Lenis scroll event.
 *
 * Disabled entirely under prefers-reduced-motion. Hijacking scroll is exactly
 * what makes motion-sensitive people ill, and native scrolling is the right
 * fallback — not a faster version of the same effect.
 */

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Browsers restore scroll position before this runs; recalculate after.
    ScrollTrigger.refresh();

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return null;
}
