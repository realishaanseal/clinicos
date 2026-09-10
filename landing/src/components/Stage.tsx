"use client";

/**
 * The stage: the whole background, re-lit and re-shaped continuously by scroll.
 *
 * Four things change together, not two:
 *
 *   1. COLOUR — every section has a scene (see scenes.ts) and the page
 *      cross-fades between them: ground, three light colours, and the text
 *      accent. Interpolated into CSS variables, so anything reading those vars
 *      (body, blob gradients, SVG gradient stops, eyebrows, the progress bar)
 *      re-lights at once. This is why the top and bottom of the page look like
 *      different products.
 *   2. SHAPE — three glass forms morph through six silhouettes via MorphSVG,
 *      each on its own offset through the sequence so no two are ever alike.
 *   3. THE AURORA — a large conic wash rotating and drifting behind everything.
 *   4. RIBBONS + HORIZON — ambient SMIL and CSS loops that keep running when
 *      scrolling stops, so the page is never frozen.
 *
 * Colour is interpolated by hand into CSS vars rather than handed to GSAP as a
 * property, because interpolating a custom property's colour is not something
 * GSAP can be relied on to do across browsers. A proxy object plus
 * gsap.utils.interpolate is boring and always works.
 *
 * Everything here is aria-hidden and decorative. Under reduced motion the
 * first scene renders and nothing moves.
 */

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { SHAPES, SEQUENCE } from "./shapes";
import { SCENES } from "./scenes";

const VARS = ["ground", "a", "b", "c", "accent"] as const;

export default function Stage() {
  const still = !!useReducedMotion();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.documentElement;

    // Paint the first scene immediately either way, so there is no flash of
    // unstyled colour before the timeline takes over.
    for (const k of VARS) el.style.setProperty(`--scene-${k}`, SCENES[0][k]);
    if (still) return;

    gsap.registerPlugin(ScrollTrigger, MorphSVGPlugin);

    const ctx = gsap.context(() => {
      const shapeSteps = SEQUENCE.length - 1;
      const sceneSteps = SCENES.length - 1;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: document.documentElement,
          start: "top top",
          end: "bottom bottom",
          scrub: 1.15,
        },
      });

      // ---- colour: cross-fade the scene through the whole scroll ----------
      const proxy = { t: 0 };
      tl.to(proxy, {
        t: sceneSteps,
        ease: "none",
        onUpdate: () => {
          const i = Math.min(Math.floor(proxy.t), sceneSteps - 1);
          const f = proxy.t - i;
          const from = SCENES[i];
          const to = SCENES[i + 1];
          for (const k of VARS) {
            el.style.setProperty(`--scene-${k}`, gsap.utils.interpolate(from[k], to[k], f) as string);
          }
        },
      }, 0);

      // ---- shape: three forms, each offset through the sequence -----------
      const forms = [
        { sel: ".morph-a", offset: 0 },
        { sel: ".morph-b", offset: 2 },
        { sel: ".morph-c", offset: 4 },
        // the hazier off-centre ones morph too, on their own offsets
        { sel: ".haze-a", offset: 1 },
        { sel: ".haze-b", offset: 3 },
        { sel: ".haze-c", offset: 5 },
      ];
      SEQUENCE.slice(1).forEach((_, i) => {
        const at = i / shapeSteps;
        forms.forEach(({ sel, offset }) => {
          const name = SEQUENCE[(i + 1 + offset) % SEQUENCE.length];
          tl.to(`${sel} path`, {
            morphSVG: SHAPES[name],
            duration: 1 / shapeSteps,
            ease: "power1.inOut",
          }, at);
        });
      });

      // ---- travel ---------------------------------------------------------
      tl.to(".morph-a", { xPercent: -12, yPercent: 14, scale: 1.16, rotate: 62, ease: "none" }, 0)
        .to(".morph-b", { xPercent: 20, yPercent: -24, scale: 0.74, rotate: -84, ease: "none" }, 0)
        .to(".morph-c", { xPercent: -26, yPercent: -12, scale: 1.3, rotate: 120, ease: "none" }, 0)
        .to(".haze-a", { xPercent: 34, yPercent: -30, scale: 1.5, rotate: -140, ease: "none" }, 0)
        .to(".haze-b", { xPercent: -30, yPercent: 34, scale: 1.7, rotate: 96, ease: "none" }, 0)
        .to(".haze-c", { xPercent: 44, yPercent: 26, scale: 1.25, rotate: -60, ease: "none" }, 0)
        .to(".aurora", { rotate: 190, scale: 1.5, ease: "none" }, 0)
        .to(".stage-ribbons", { yPercent: 18, scale: 1.28, rotate: -12, ease: "none" }, 0)
        .to(".horizon", { yPercent: -52, scale: 1.6, opacity: 0.35, ease: "none" }, 0);

      gsap.to(".flow", {
        yPercent: -16, ease: "none",
        scrollTrigger: { trigger: document.documentElement, start: "top top", end: "bottom bottom", scrub: 1.6 },
      });

      // ---- a light sweep as each section arrives --------------------------
      gsap.utils.toArray<HTMLElement>("section").forEach((s) => {
        gsap.fromTo(".sweep",
          { opacity: 0, xPercent: -120 },
          {
            opacity: 0.5, xPercent: 120, duration: 1.4, ease: "power2.inOut",
            scrollTrigger: { trigger: s, start: "top 72%", once: false, toggleActions: "play none none none" },
          }
        );
      });

      gsap.utils.toArray<HTMLElement>(".stagger-group").forEach((group) => {
        gsap.from(group.children, {
          y: 54, opacity: 0, scale: 0.97,
          duration: 0.9, ease: "power3.out", stagger: 0.09,
          scrollTrigger: { trigger: group, start: "top 84%", once: true },
        });
      });
    }, root);

    return () => ctx.revert();
  }, [still]);

  const s0 = SHAPES[SEQUENCE[0]];
  const s2 = SHAPES[SEQUENCE[2]];
  const s4 = SHAPES[SEQUENCE[4]];

  return (
    <div className="stage" ref={root} aria-hidden="true">
      <div className="aurora" />
      <div className="sweep" />

      {/* Hazier companions, scattered off-centre to fill the frame. Their own
          SVG so they can be blurred and dimmed hard without touching the crisper
          right-hand cluster. */}
      <svg className="stage-haze" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="hz1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className="stop-b" />
            <stop offset="100%" className="stop-c" />
          </linearGradient>
          <linearGradient id="hz2" x1="0.2" y1="0" x2="0.9" y2="1">
            <stop offset="0%" className="stop-a" />
            <stop offset="100%" className="stop-ground" />
          </linearGradient>
        </defs>
        <g className="haze-a form"><path d={s2} fill="url(#hz1)" /></g>
        <g className="haze-b form"><path d={s4} fill="url(#hz2)" /></g>
        <g className="haze-c form"><path d={s0} fill="url(#hz1)" /></g>
      </svg>

      <svg className="stage-svg" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Gradient stops read the scene variables, so the forms re-light with
              the page rather than staying one fixed blue. */}
          <linearGradient id="gA" x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0%" className="stop-a" />
            <stop offset="45%" className="stop-b" />
            <stop offset="100%" className="stop-c" />
          </linearGradient>
          <linearGradient id="gB" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" className="stop-c" />
            <stop offset="60%" className="stop-a" />
            <stop offset="100%" className="stop-ground" />
          </linearGradient>
          <linearGradient id="gC" x1="0" y1="0.2" x2="1" y2="0.9">
            <stop offset="0%" className="stop-b" />
            <stop offset="70%" className="stop-c" />
            <stop offset="100%" className="stop-ground" />
          </linearGradient>
          <radialGradient id="spec" cx="0.34" cy="0.24" r="0.44">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <clipPath id="clipA"><path className="clip-a" d={s0} /></clipPath>
          <filter id="soften" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <g className="morph-c form"><path d={s4} fill="url(#gC)" /></g>
        <g className="morph-b form"><path d={s2} fill="url(#gB)" /></g>
        <g className="morph-a form">
          <path d={s0} fill="url(#gA)" />
          <g clipPath="url(#clipA)">
            <ellipse cx="215" cy="185" rx="155" ry="108" fill="url(#spec)" filter="url(#soften)" />
          </g>
        </g>
      </svg>

      <svg className="stage-ribbons" viewBox="0 0 1220 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="rg1" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" className="stop-ground" stopOpacity="0" />
            <stop offset="34%" className="stop-a" stopOpacity="0.8" />
            <stop offset="64%" className="stop-b" stopOpacity="0.9" />
            <stop offset="100%" className="stop-c" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="ribbon r1"
          fill="url(#rg1)"
          d="M-120 430 C 140 250, 360 560, 620 380 C 880 200, 1080 500, 1340 310 L 1340 470 C 1080 660, 880 360, 620 540 C 360 720, 140 400, -120 570 Z"
        >
          {!still && (
            <animate
              attributeName="d" dur="21s" repeatCount="indefinite" calcMode="spline"
              keyTimes="0;0.33;0.66;1"
              keySplines="0.45 0 0.55 1; 0.45 0 0.55 1; 0.45 0 0.55 1"
              values="M-120 430 C 140 250, 360 560, 620 380 C 880 200, 1080 500, 1340 310 L 1340 470 C 1080 660, 880 360, 620 540 C 360 720, 140 400, -120 570 Z;M-120 500 C 140 340, 360 420, 620 300 C 880 180, 1080 420, 1340 250 L 1340 430 C 1080 600, 880 340, 620 470 C 360 600, 140 520, -120 640 Z;M-120 380 C 140 200, 360 620, 620 430 C 880 240, 1080 560, 1340 380 L 1340 520 C 1080 700, 880 420, 620 590 C 360 760, 140 350, -120 520 Z;M-120 430 C 140 250, 360 560, 620 380 C 880 200, 1080 500, 1340 310 L 1340 470 C 1080 660, 880 360, 620 540 C 360 720, 140 400, -120 570 Z"
            />
          )}
        </path>
      </svg>

      <div className="horizon">
        <div className="horizon-bloom" />
        <div className="horizon-rim" />
      </div>
    </div>
  );
}
