# Premium landing page — reusable brief

What you actually asked for on the ClinicOS site, written so you can paste it
straight into a new project. Includes the corrections you had to make along the
way, so you can front-load them and skip the rounds.

---

## 1. The paste-ready prompt

> Build a landing site for **[PRODUCT]**, a **[ONE-LINE DESCRIPTION]** from
> **[PARENT COMPANY]**. Audience is **[WHO — e.g. hospital executives, enterprise
> buyers]**, international, not one region.
>
> **Visual language:** dark, near-black ground with an electric blue-to-cyan light
> source. Frosted glassmorphism panels with iridescent rim edges. Large organic
> glass forms in the background as *lighting*, never as foreground subjects.
> No particle fields.
>
> **Motion:** the whole background transforms continuously as you scroll — colour,
> shape and light together, not just fades. Each section has its own colour scene
> and the page cross-fades between them, so the top and bottom look like different
> worlds. Background forms morph between genuinely different silhouettes. Smooth
> scroll. Transitions should be slow enough to notice.
>
> **Structure:** long scroll, roughly 10 viewports. Hero → problem with cited
> figures → how it works → trust/privacy → what's built → **product tour** →
> audience → honest status → footer. The product tour is a sticky-stage sequence
> of 4 app screens, each entering on a *different* transition, with realistic
> filled-in demo content — never grey placeholder bars.
>
> **Copy:** write like a company, not like an AI. Second person. Short sentences.
> Real cited numbers, no invented statistics.
>
> **Stack:** Next.js, GSAP (ScrollTrigger + MorphSVG), Lenis, Motion. Deploy to
> Vercel. Show me a screen recording, not screenshots — stills can't show motion.

---

## 2. The visual system

**Ground.** Near-black with a colour cast (`#03060a`, not pure `#000`). Pure black
looks cheap and kills the glass.

**Glass panels.**
```
background:        rgba(255,255,255,0.045)
border:            1px solid rgba(255,255,255,0.10)
backdrop-filter:   blur(24px) saturate(180%)
box-shadow:        inset 0 1px 0 rgba(255,255,255,0.08),
                   0 20px 54px -26px rgba(0,0,0,0.95)
```
Plus a 1px iridescent line along the top edge (green → cyan → violet → pink
gradient) that brightens on hover. That top edge is what separates "premium glass"
from "grey box with a border".

**Hover.** Lift 6–7px, brighten the border, deepen the shadow. 420ms. Never animate
`backdrop-filter` itself.

**Background forms.** Two layers:
- A crisp cluster on one side (the "subject"), held at ~34% opacity with ~1.6px blur.
- Three hazier ones scattered off-centre at ~20% opacity with ~46px blur, to fill
  the frame without competing.

**Rule that matters most:** the background is lighting. If it's sharp enough to
read as an object, it's too strong — it will bleed through the frosted panels and
hurt the text behind them.

---

## 3. The motion system

**Colour scenes — the thing that makes it feel expensive.**

One scene per section: `ground`, three light colours, and a text accent. A GSAP
timeline scrubbed to the whole document cross-fades between them. Every colour on
the page reads a CSS variable, including SVG gradient stops via `stop-color`. Adding
a section = adding one scene entry, nothing else.

```
hero      electric blue / cyan
problem   colder indigo
how       teal
privacy   deep ocean
tour      darkest (so the screens carry the light)
audience  violet, most open
status    settles back toward the hero
```

**Shape.** Background forms morph between 5–6 genuinely different silhouettes via
GSAP MorphSVG, each form offset through the sequence so no two are ever alike.

**Ambient loops** that keep running when scrolling stops — SVG path morphs in SMIL,
a rotating conic aurora, a breathing horizon arc. Without these the page freezes
the moment someone stops scrolling.

**Text.** Words rise out of an 8px blur on a ~55ms stagger. Words, not characters —
per-character reads as a novelty typewriter and wrecks text selection. Accent words
get a gradient that sweeps on a loop.

**Plus:** staggered card entrances, numbers counting up on `easeOutExpo` when they
enter view, a scroll progress bar, a light band sweeping across as each section
arrives.

**Timing.** Marketing motion is *slower* than product UI motion: 240ms / 460ms /
780ms here versus 120–200ms in an app. The app must feel instant; the page should
feel unhurried.

---

## 4. The product tour

Four app screens on a **CSS sticky** stage, each entering on a different effect:
3D card flip → slide-and-unblur → drop-back-and-settle. Four identical fades read
as one long section rather than four screens.

**Fill the screens with real content.** This was your correction and it's the single
biggest quality jump. Grey placeholder bars look unfinished. Real content means:
actual patient names and times, a real transcript with a blinking caret, a real
clinical note with EDITED badges, a real prescription with dosing and a signature.

**Make it one thread.** The same patient appears in the transcript, the note and the
prescription. You can then talk an audience through one case across four screens
instead of four unrelated mock-ups.

**Label it honestly.** "Illustration of the interface — not a live system." An
interface picture implying a running system it can't show is what gets noticed in a
room of experts.

---

## 5. Copy voice — how to not sound like AI

The tell you caught was **one construction used over and over**:

> "That is not only a privacy stance, it is…"
> "The record is not free, it is just billed later."
> "not an edge case"
> "not a setting somebody can leave switched off"

*"Not X, it's Y."* Once you see it you can't unsee it. It's the most reliable
signature of machine-written marketing copy.

**Rules:**

| Do | Don't |
|---|---|
| Second person — "you review it and sign" | Third person — "the clinician reviews" |
| Short sentences. Full stops. | Em-dash chains |
| One idea per sentence | Balanced antithesis every other line |
| "Five steps. You do one of them." | "Five steps, and the clinician performs one of them." |
| Cited real numbers | Invented statistics |
| State the limitation plainly | Hedge it into meaninglessness |

**Say the uncomfortable thing.** An "early, and we'll say so" section reads as
rigour to serious buyers. Overclaiming is what loses the room.

---

## 6. Stack

```
Next.js (App Router)  ·  GSAP 3.15+  ·  Lenis  ·  Motion
```

**GSAP's premium plugins are all free since 2025** — MorphSVG, SplitText, DrawSVG,
Flip, ScrollSmoother are already in the public `gsap` package. Check
`node_modules/gsap/` before assuming you need a workaround.

Deploy: Vercel, Root Directory set to the landing folder.

---

## 7. Gotchas that cost real time

**`gsap.context()` scopes selector strings to the root's *descendants*.** If the
trigger element *is* the context root, `trigger: ".tour"` matches nothing and the
entire timeline silently does nothing — no error. Pass the element.

**Use CSS `position: sticky`, not GSAP `pin`.** Pin rewrites the element to
`position: fixed` and computes its offset from ScrollTrigger's own scroll position,
which fights Lenis. It put a whole section 1600px below the viewport. Sticky is the
browser's job and never disagrees with the scroll library.

**Run Lenis off `gsap.ticker`,** not its own RAF loop. Two clocks make scroll-linked
animation lag the real scroll by a frame or two and the page feels loose.

**Interpolate CSS variable colours by hand** — a proxy object plus
`gsap.utils.interpolate`. Animating a custom property's *colour* isn't reliable
across browsers.

**MorphSVG wants matched path structures.** Generate all silhouettes from one
sampler at the same point count. Mismatched paths make the plugin guess at point
correspondence and shapes fold through the transition.

**Never animate `backdrop-filter`.** It re-blurs the whole region every frame.
Animate `transform`, `opacity`, `border-color`, `box-shadow`.

**`transform`/`opacity` composite; `border-radius`, `clip-path` and SVG `d` repaint.**
Morphs must be few and large, never many and small — and never behind a
`backdrop-filter` region.

**Mask the background layer's edge, don't clip it.** Blurred children clipped at a
container edge leave a hard visible seam.

**Readability beats spectacle, every time.** Two separate rounds were lost to a
background sitting on top of the copy. Below ~980px, dim the background and put a
scrim over it.

---

## 8. Accessibility, non-negotiable

Everything inside `@media (prefers-reduced-motion: no-preference)`. Under reduced
motion: Lenis off entirely (scroll hijacking is exactly what makes motion-sensitive
people ill), sticky sequences become stacked content, all loops stop, all text
visible. Decorative layers get `aria-hidden`. Animated text exposes the full string
once via `aria-label` so a screen reader reads a sentence, not a word list.

---

## 9. The rounds you had to correct — front-load these

1. **"Particles don't suit the subject."** Abstract tech-demo aesthetics don't fit
   serious products. Say the visual language up front.
2. **"Where are the morphed transitions?"** Fades aren't morphs. Ask for shape
   morphing explicitly.
3. **"The whole background should transform, colour changes too."** Say *scene
   changes per section*, not just "animated background".
4. **"It's too sharp, reduce opacity."** State that background forms are lighting,
   held well under the content.
5. **"Fill the demo with real info."** Say "realistic filled content, no placeholder
   bars" in the first ask.
6. **"Make it sound like a real company."** Name the voice up front.
7. **Ask for a screen recording.** Stills can't show motion — several rounds were
   spent describing things you couldn't see.

---

## 10. Section skeleton

```
Hero          headline + one-paragraph lede + two CTAs
Problem       3–4 cited figures as glass cards, counting up
How it works  5 steps
Trust         4 promise cards, one of them a "Never" card
What's built  6 feature cards — the unglamorous operational stuff
Product tour  4 sticky screens, different transitions, real content
Audience      the range you serve, smallest case first
Status        honest current state
Footer        sources cited in full
```

The "Never" card — what the product deliberately doesn't do — is worth keeping in
every version. It reads as confidence, and with regulated buyers it's often the
most important claim on the page.
