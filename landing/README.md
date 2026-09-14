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

## Contact form and privacy

Every address the site points at lives in `src/site.ts`: the public site URL,
the contact email and the contact form link. Change them there, nowhere else.

- **Contact form** is a Tally form ("Talk to ClinicOS"). Responses land in the
  Tally account, not in this repo, and nothing is posted from the site itself.
  The form links back to `/privacy`, so if `SITE_URL` changes, update that link
  in Tally too.
- **`/privacy`** makes specific promises: no cookies, no analytics, no
  third-party scripts, and form responses deleted within 12 months of last
  contact. Adding any tracking or a new form provider means changing that page
  in the same commit, and the 12-month deletion has to actually happen.
- **`SITE_URL`** drives the share-preview image, `robots.txt` and the sitemap.
  It must match the domain the Vercel project actually serves.

`icon`, `apple-icon` and `opengraph-image` are generated at build time with
`next/og` from `src/components/BrandMark.tsx`. That renderer (Satori) supports
only flexbox, inline styles and gradients, so keep the mark inside that subset.
The share image is laid over a still from the backdrop film, `media/og-backdrop.jpg`.

## Design

### The film

**The ClinicOS film runs behind the whole site**: 3.15 seconds of glass lenses
turning in green light, scrubbed forward as you scroll. It opens near-black on a
single rim, light sweeps across the glass, and it ends in a mint-white bloom. So
the top of the page is the dark opening and "Get in touch" is the bloom. It is
the real footage, not a WebGL or SVG imitation of it.

**Source and build.** `media/backdrop-source.mp4` is the original (720×1280
portrait, 60 fps). `scripts/backdrop.py` turns it into what ships in
`public/backdrop/v2/`:

1. **AI upscale.** Real-ESRGAN's video model, `realesr-animevideov3`, at 4×, then
   down to 1440×2560. It was compared with plain Lanczos and with the general
   `realesrgan-x4plus` model on a dark, a fast and a bright frame. It sharpens the
   glass rims and clears the source's compression blocking without moving the
   colours (x4plus brightened the whites), and it does not shimmer from frame to
   frame.
2. **AI interpolation.** RIFE v4.6, in UHD mode, to eight frames per source frame.
   On the fastest pair of frames, ffmpeg's motion-compensated interpolation warped
   the thick rim; RIFE did not. The script checks that RIFE's output lines up with
   the source frames before it uses any of it.
3. **Selection.** Only the frames that differ visibly from the last one kept, and
   never more than 1/30 s apart: 491 frames, most of them in the first 1.2 s, where
   the film moves.
4. **AVIF packs.** Every frame at 1080p and at 1440p, landscape rotated a
   quarter-turn clockwise (a 16:9 crop threw away two thirds of the frame; clockwise
   keeps the copy side darkest through the opening). Five packs per set: the first
   holds every sixteenth frame and the whole opening, and each after it doubles the
   density. A device loads one set: 4.4–6.6 MB in all depending on orientation and
   size, of which the first pack is 489–737 KB. Quality 45 was picked by a sweep:
   44.5–46.3 dB against lossless, and indistinguishable from it at 2× zoom in the
   near-black gradients, where banding shows first.
5. The posters (AVIF, with WebP for browsers without it), the readability tables,
   the share-image still, and `src/components/backdrop-frames.ts`.

**Rebuilding it.** The AI tools are not in the repo. Download
`realesrgan-ncnn-vulkan-20220424-windows.zip` from github.com/xinntao/Real-ESRGAN
(release v0.2.5.0) and `rife-ncnn-vulkan-20221029-windows.zip` from
github.com/nihui/rife-ncnn-vulkan, and unzip both. Then
`pip install imageio-ffmpeg numpy pillow` and
`python scripts/backdrop.py --esrgan <folder> --rife <folder>`. Any Vulkan GPU
works. **When the film changes, move it to a new folder (`v3`)**, because
`/backdrop/*` is cached for a year (`next.config.ts`).

**Playback** (`Backdrop.tsx`) is a canvas, not a video. The first version seeked a
`<video>`, and scrolling through it looked like ten frames a second: a seek is
asynchronous and takes the decoder tens of milliseconds, and 190 frames over
~10,000 px of scroll meant one frame every 50 px. Now:

- Frames are decoded off the main thread with `createImageBitmap` into a small cache
  around the frame on screen (12 at 1440p, 16 at 1080p, 8 on low-memory devices),
  leaning in the direction of travel.
- Every screen refresh draws the exact moment the scroll is at, as a blend of the two
  nearest frames, so motion never steps at any refresh rate.
- The 1440p set loads only where the screen has the pixels for it (over 2000 px on its
  long edge) and the device reports at least 4 GB of memory.
- While only the drift is moving, redraws are capped at 30 a second, so a 240 Hz
  screen is not re-blurring every glass panel for nothing.
- The position eases toward the scroll target, drifts a few frames either way while
  the page is still, and on a fresh load at the top the opening plays in over 2.6 s.

**Readability by construction.** For every frame and each of 24 horizontal bands of
the screen, the script records the least darkening that text in that band needs to
hold 4.5:1: over the copy column (whose veil fades out to the right), across a
centred section, and under a glass panel. It measures to 4.8:1 and rounds up, for
headroom. The result ships as a small binary table per orientation
(`v2/*-table.bin`), with frame 0 inside `backdrop-frames.ts` for the poster.
`Backdrop.tsx` checks which bands have text, panels or the header in them at that
moment and sets the veils, `--panel-a` and `--header-a` to what those bands need, so
the film is dimmed only where something is being read over it. One figure per frame
for the whole column was tried first. Measured over the full height, it dimmed the
opening for text nowhere near its light; measured over the middle 80%, a label
scrolling in at the screen edge fell to 2.2:1. **The colours in the script must match
`--veil`, `--panel-rgb`, `--fg-dim` and `--fg-faint` in `globals.css`.** Change one,
re-run the script.

**Colour.** Each section has a scene in `scenes.ts`: ground, three light colours,
text accent, the moment of the film it holds at, and which veil it wants. The palette
is taken from the film. Nothing on the page hard-codes a colour that takes part in
this — everything reads the `--scene-*` variables. **Adding a section means adding a
scene and its id to `SCENE_ANCHORS`.** Colour is interpolated by hand into the
variables, because interpolating a custom property's *colour* is not reliable across
browsers.

**Fallbacks.** Under reduced motion, or with Save-Data on, no frames load and the
poster stays; it is near-black, so every section reads. If the frame packs or the
table cannot be fetched or decoded (a browser without AVIF, say), the film is never
shown and the poster stays.

**Grain.** A static SVG noise layer, the way grain sits on a projected print. It does
not move, because moving grain would redraw the whole screen every frame.

**Lenis** smooth scroll runs off `gsap.ticker` rather than its own RAF loop. Two
clocks make scroll-linked animation lag the real scroll by a frame or two.

### The lockup

`Wordmark.tsx`: the ClinicOS tile, "Varaxis" heavy and white, and "ClinicOS"
lighter in the film's mint — the arrangement every Varaxis product uses. It sits
in the header and the footer. The tile's mark (three lines of a note, the last
shorter) must stay in step with `BrandMark.tsx`. The type is the system display
face; the site loads no webfonts.

The header (`SiteHeader.tsx`) is clear over the film at the top of the page, with
only the per-frame band behind it. Once the page scrolls it takes a smoked-glass
bar, faded in on a pseudo-element's opacity.

### The product tour

`ProductTour.tsx` is a sticky-stage sequence of four app screens, each entering on a
different transition — 3D card flip, slide-and-unblur, drop-back-and-settle —
because four identical fades read as one long section rather than four screens.

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

### Text

`AnimatedText.tsx`: words rise out of a blur on a stagger, so a headline assembles
rather than fading in as a block. Words, not characters — per-character animation
on a long line reads as a novelty typewriter and wrecks text selection. The full
string is exposed once via `aria-label` and the animated spans are `aria-hidden`,
so a screen reader reads one sentence rather than a word list. Accent words are
marked with `[[double brackets]]` and get a gradient that sweeps on a 9s loop.

### Rules that matter when extending this

- **Do not go back to seeking a `<video>` for scroll-scrubbing.** See Playback.
- **Never animate `backdrop-filter`.** Animate `transform`, `opacity`,
  `border-color` and `box-shadow`. Every hover state here follows that.
- **Never transition a glass panel's `background`.** Its tint follows the film
  frame by frame; easing it would leave the panel lighter than the frame needs.
- Section headlines are capped at 19ch so they stay inside the veiled copy column.
- Scroll reveals use native CSS scroll-driven animations (`animation-timeline: view()`).
  `Reveal.tsx` attaches an IntersectionObserver *only* where those are unsupported
  (Firefox). The `@supports` test includes `animation-range` on purpose, to exclude
  partial implementations.
- All motion is decorative, and all of it respects `prefers-reduced-motion`. The
  page reads correctly with every animation disabled.

## Content

ClinicOS is positioned as a Varaxis product for clinics and hospitals
internationally — from a single-room practice to a hospital department. It is not
a project about one town.

Every figure is cited inline and traceable to `docs/ClinicOS_Problem_Statement.md`.
Do not add claims the product cannot support — in particular nothing implying it
makes a clinical judgement, which it must not.
