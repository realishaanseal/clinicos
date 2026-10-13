---
name: clinicos-motion
description: Animation and 3D system for ClinicOS. Use whenever adding, changing or reviewing motion — transitions, page/route animation, scroll effects, 3D scenes, loading and recording states — in this repo. Covers which library to reach for, the two motion tiers, the reduced-motion contract, and the Next.js 15 rules for keeping three.js out of the clinical bundle.
---

# Motion in ClinicOS

## The one rule that decides everything

**Which surface is this?** ClinicOS has two, and they get opposite treatment.

| | Clinical surface | Marketing surface |
|---|---|---|
| Where | `/`, `/patients`, `/consult/[id]`, `/settings` | landing / demo / pitch pages only |
| Who is looking | a doctor with ~2 minutes per patient | someone deciding whether to care |
| Motion's job | confirm what happened, nothing else | hold attention |
| Budget | ≤ 200ms, no 3D, no scroll effects | expressive; 3D allowed |
| Library | CSS transitions, `motion` | `motion`, GSAP, R3F, Lenis |

A doctor sees the consult screen forty times a day. Animation that delights on
view one is an obstacle by view ten. On clinical screens motion is only ever
allowed to answer *"did that save?"*, *"is it recording?"*, *"where did this row
go?"* — never to decorate. If an animation would still be there after you removed
every non-informative frame, it does not belong on a clinical screen.

This is not a style preference. `CLAUDE.md` invariant: *"a clinical tool that looks
busy looks untrustworthy."*

## Reduced motion is not optional

Every animation in this repo must degrade. Vestibular disorders are common, and
this is health software. `globals.css` carries a global guard that flattens CSS
animation, and JS-driven motion must check the same signal:

```ts
// src/lib/useReducedMotion.ts
const reduced = useReducedMotion();          // from "motion/react"
<motion.div animate={{ y: reduced ? 0 : -8 }} />
```

GSAP and R3F do not read the media query for you. Guard them explicitly:

```ts
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
```

Never ship an animation whose *meaning* is lost when it is disabled. If a state
change is only communicated by movement, it is a bug — add text or colour too.

## Picking a library

- **CSS transition** — hover, focus, colour, small size changes. The default.
  Reach for JS only when CSS genuinely cannot do it.
- **`motion`** (motion.dev, the successor to Framer Motion) — enter/exit
  (`AnimatePresence`), layout animation (`layout` prop, for reordering the patient
  list or the resume list), shared-element transitions, spring physics. This is the
  right tool for ~90% of what this app needs.
- **GSAP** — long timelines and scroll-driven sequences where you need one
  authoritative timeline with precise offsets. `ScrollTrigger` is free now (all
  GSAP plugins went free in 2025). Marketing surface only.
- **Lenis** — smooth scroll. Marketing surface only; it hijacks native scrolling,
  which is unacceptable on a screen someone uses under time pressure.
- **React Three Fiber + drei** — 3D. Marketing surface only. See bundle rules below.

## Next.js 15 rules

This is the App Router with React 19. Server Components are the default.

1. Any file using `motion`, GSAP, Lenis or R3F needs `"use client"` at the top.
   Keep it on the smallest leaf component, not on a whole page.
2. **three.js must never reach the clinical bundle.** It is ~600KB before your
   scene. Always load 3D through a client-only dynamic import:

   ```tsx
   const Scene = dynamic(() => import("./Scene"), {
     ssr: false,
     loading: () => <div className="scene-fallback" />,
   });
   ```

   `ssr: false` is required, not an optimisation — R3F touches `window` and WebGL
   during render and will crash the server build without it.
3. Check the cost before and after with `npx next build` and read the route table.
   If a clinical route's First Load JS moves at all after a motion change,
   something leaked. Find it.
4. `next.config.ts` already sets `serverExternalPackages: ["better-sqlite3"]`.
   Do not add three.js there — it is a client package, not a server one.

## Timing that matches the existing design system

`globals.css` already animates at 0.12–0.2s with `ease`. Stay inside that world;
do not introduce a second, slower vocabulary.

```css
--dur-1: 120ms;   /* colour, opacity, table row hover              */
--dur-2: 180ms;   /* enter/exit, small translate                   */
--dur-3: 260ms;   /* layout shifts, modals, route changes          */
--ease-out: cubic-bezier(0.2, 0.8, 0.3, 1);   /* things arriving   */
--ease-in:  cubic-bezier(0.5, 0, 0.75, 0);    /* things leaving    */
```

Existing named animations worth reusing rather than reinventing: `pulse`
(the recording dot), `bar` (the waveform), `fade`, `rise` (modal entry).

Motion springs that match: `{ type: "spring", stiffness: 400, damping: 34 }` for
UI, never bouncier. Overshoot reads as playful, and playful reads as unserious in
a clinic.

## 3D that is worth the weight

If a 3D scene is going on a marketing surface, it has to earn ~600KB:

- **Show the actual product idea.** A rotating abstract blob is decoration; a
  waveform resolving into a written prescription is the pitch.
- **Cap the device cost.** `<Canvas dpr={[1, 1.5]} gl={{ antialias: false }}>` and
  `frameloop="demand"` when the scene is static. The target audience includes
  low-end clinic laptops — test as if the GPU is bad, because it often is.
- **Pause offscreen.** Use an IntersectionObserver or drei's `<AdaptiveDpr />`;
  never leave a render loop running under the fold.
- **Always ship a static fallback** for reduced-motion, WebGL failure, and the
  loading state. A poster image is a legitimate final answer.

## Reviewing motion

Ask, in order: Does it survive `prefers-reduced-motion`? Does it communicate
something a static state could not? Is it under 200ms on a clinical screen? Did
First Load JS stay flat? Would a doctor on their fortieth consultation of the day
still be glad it is there?

If any answer is no, cut it. Cutting animation is almost never the wrong call in
this codebase.
