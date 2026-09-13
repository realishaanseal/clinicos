# ClinicOS — landing site

A standalone Next.js app. **It has no database, no API routes, and no access to
anything in `../clinicos-app`.** That separation is deliberate: the clinical app
must never be deployed to a public host (invariant 2 in `CLAUDE.md` — patient data
never leaves the institution's machine). This site can be, because it holds nothing.

```bash
npm install
npm run dev      # http://localhost:3001
```

Port 3001, so it runs alongside the clinical app on 3000.

## Deploying

Vercel, with **Root Directory set to `landing`**. No environment variables, no
database, no build overrides. The page is fully static.

## Contact, pilot form and privacy

Every address the site points at lives in `src/site.ts`: the public site URL,
the contact email and the pilot form link. Change them there, nowhere else.

- **Pilot form** is a Tally form ("Talk to ClinicOS"). Responses land in the
  Tally account, not in this repo, and nothing is posted from the site itself.
  The form links back to `/privacy`, so if `SITE_URL` changes, update that link
  in Tally too.
- **`/privacy`** makes specific promises: no cookies, no analytics, no
  third-party scripts, and form responses deleted within 12 months of last
  contact. Adding any tracking or a new form provider means changing that page
  in the same commit, and the 12-month deletion has to actually happen.
- **Pilot terms** on the home page mirror `docs/ClinicOS_Pilot_Agreement.md`.
  Keep the two in step.
- **`SITE_URL`** drives the share-preview image, `robots.txt` and the sitemap.
  It must match the domain the Vercel project actually serves.

`icon`, `apple-icon` and `opengraph-image` are generated at build time with
`next/og` from `src/components/BrandMark.tsx`. That renderer (Satori) supports
only flexbox, inline styles and gradients, so keep the mark inside that subset.

## Design

Morphing light on near-black, with frosted glass panels over it.

**The whole scene transforms on scroll** — colour, shape and light together
(`Stage.tsx`, `scenes.ts`, `shapes.ts`):

- **Colour.** Each section has a scene in `scenes.ts` (ground, three light
  colours, text accent) and the page cross-fades between them as you scroll. The
  hero is electric blue, the middle indigo, the foot teal. Nothing on the page
  hard-codes a colour that takes part in this — everything reads the `--scene-*`
  variables, including SVG gradient stops via `stop-color`. **Adding a section
  means adding a scene and nothing else.**
  Colour is interpolated by hand into the variables (a proxy object plus
  `gsap.utils.interpolate`) rather than handed to GSAP as a property, because
  interpolating a custom property's *colour* is not reliable across browsers.
- **Shape.** Three glass forms morph through six silhouettes via GSAP
  **MorphSVG** — stacked lenses, lens chain, ribbon swirl, horizon crescent,
  faceted three-point, liquid teardrop — each offset through the sequence so no
  two are ever the same shape.
  `shapes.ts` is **generated**: every silhouette comes from one polar sampler at
  72 points, so all six share an identical command structure. MorphSVG copes with
  mismatched paths but has to guess at point correspondence, and you get shapes
  that fold through the transition. If you add a shape, generate it the same way.
- **Aurora.** A large conic wash rotating behind everything, recoloured by the
  scene, plus a light band that sweeps across as each section arrives.
- **Ambient loops.** Ribbons morph via SVG `d` interpolation in SMIL and the
  horizon breathes — these keep running when scrolling stops, so the page is
  never frozen.
- **Lenis** drives it all, run off `gsap.ticker` rather than its own RAF loop.
  Two clocks make scroll-linked animation lag the real scroll by a frame or two.

The glass forms are deliberately held at low opacity with a slight blur. At full
strength they read as foreground objects, fight the frosted panels, and bleed
through them enough to hurt the text behind. They are lighting, not subjects.

**The product tour** (`ProductTour.tsx`) is a sticky-stage sequence of four app
screens, each entering on a different transition — 3D card flip, slide-and-unblur,
drop-back-and-settle — because four identical fades read as one long section
rather than four screens.

Two things there are load-bearing and easy to break:

- **The stage is held with CSS `position: sticky`, not GSAP's `pin`.** Pinning
  rewrites the element to `position: fixed` and computes its offset from
  ScrollTrigger's own idea of scroll position, which fights Lenis — it put the
  whole section 1600px below the viewport when it was tried here. Sticky is the
  browser's own job and never disagrees with the scroll library.
- **The ScrollTrigger trigger is the ref element, not `".tour"`.**
  `gsap.context()` scopes selector strings to the root's *descendants*, and the
  root here *is* `.tour` — so the selector matched nothing and the timeline
  silently did nothing at all. Any ScrollTrigger whose trigger is its own context
  root must pass the element.

The screens are rendered mock-ups of the real app's structure, not screenshots,
and the section says so on the page. An interface picture implying a running
system it cannot show is the kind of thing that gets noticed in a room full of
clinicians.

**Cost.** `d` and `border-radius` repaint rather than composite, unlike `transform`
and `opacity`. That is affordable at this scale — four large elements — and would
not be at two hundred small ones. None of them sit behind a `backdrop-filter`
region, which would force a re-blur every frame.

**Text** (`AnimatedText.tsx`): words rise out of a blur on a stagger, so a headline
assembles rather than fading in as a block. Words, not characters — per-character
animation on a long line reads as a novelty typewriter and wrecks text selection.
The full string is exposed once via `aria-label` and the animated spans are
`aria-hidden`, so a screen reader reads one sentence rather than a word list.
Accent words are marked with `[[double brackets]]` and get a gradient that sweeps
on a 9s loop.

Rules that matter when extending this:

- **Never animate `backdrop-filter`.** Animate `transform`, `opacity`,
  `border-color` and `box-shadow`. Every hover state here follows that.
- Scroll reveals use native CSS scroll-driven animations (`animation-timeline: view()`).
  `Reveal.tsx` attaches an IntersectionObserver *only* where those are unsupported
  (Firefox). The `@supports` test includes `animation-range` on purpose, to exclude
  partial implementations.
- Everything sits inside `prefers-reduced-motion: no-preference`, including the
  ribbons — `Stage.tsx` renders static paths rather than `<animate>` elements when
  reduced motion is set. All motion is decorative; the page reads correctly with
  every animation disabled.
- The stage is masked to fade out on its left edge. Without that, blurred children
  get clipped at the container box and leave a hard vertical seam through the
  headline. Below 980px it dims and takes a scrim, because readability beats
  spectacle.

## Content

ClinicOS is positioned as a Varaxis product for clinics and hospitals
internationally — from a single-room practice to a hospital department. It is not
a project about one town.

Every figure is cited inline and traceable to `docs/ClinicOS_Problem_Statement.md`.
Do not add claims the product cannot support — in particular nothing implying it
makes a clinical judgement, which it must not.
