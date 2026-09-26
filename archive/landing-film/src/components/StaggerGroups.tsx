"use client";

/**
 * The panels inside each `.stagger-group` rise in one after another as the group
 * scrolls into view.
 *
 * This used to live inside the old morphing stage, only because that component
 * already had GSAP loaded. The stage is gone, so it has its own home.
 *
 * Under reduced motion nothing is hidden or moved.
 */

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function StaggerGroups() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".stagger-group").forEach((group) => {
        gsap.from(group.children, {
          y: 54,
          opacity: 0,
          scale: 0.97,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.09,
          scrollTrigger: { trigger: group, start: "top 84%", once: true },
        });
      });
    });

    return () => ctx.revert();
  }, []);

  return null;
}
