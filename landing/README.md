# ClinicOS — landing site

A standalone Next.js app. **It has no database, no API routes, and no access to
anything in `../clinicos-app`.** That separation is deliberate: nothing deployed
from here can reach a patient record, because there is no code here that could.

```bash
npm install
npm run dev      # http://localhost:3001
```

Port 3001, so it runs alongside the clinical app on 3000.

## Deploying

Vercel, with **Root Directory set to `landing`**. No environment variables, no
database, no build overrides. Every page is static.

`/app` is rewritten to the clinic app's own Vercel project (`next.config.ts`), so
a visitor only ever sees one address and the sign-in cookie belongs to it.

## The design

Rewritten on 26 Sep 2026. The previous site — the ClinicOS film scrubbed by
scroll, GSAP, Lenis, a pinned 3D product tour — is kept whole in
[`../archive/landing-film`](../archive/landing-film/README.md), including the
frame packs and the Python pipeline that built them. Nothing was deleted; it is
an asset, not a deploy target. Read its README before reusing any of it: the
film's playback and readability machinery is subtle and cost real time to get
right.

### What this version is

**Premium by restraint, not by machinery.** One sheet of warm paper, hairline
rules between sections, one teal, big type, and the product itself on the page.

**It is the product's design system.** The tokens in `globals.css` are the same
values as `clinicos-app/src/app/globals.css` — `--canvas`, `--ink-900`,
`--teal-600`, `--line`, the `--sh-*` elevation scale. A site that looks like the
software is a claim about the software, and keeping them in step costs nothing.
If a brand colour changes in the app, change it here in the same commit.

### What it deliberately does not have

| Removed | Why |
|---|---|
| `gsap`, `lenis`, `motion` | 3 dependencies for decoration. Everything they did here is CSS now. |
| The film, `/public/backdrop/**` | 21 MB of AVIF frame packs and a canvas decoding them on every scroll frame. Kept in the archive. |
| Every client component | No hydration, no scroll listener, no `useEffect` anywhere on the site. |
| `next/og`'s background photograph | The share card is drawn from the same tokens as the page, so there is no image to keep in step. |
| Webfonts | Google Fonts is unreachable in some sandboxes (`CLAUDE.md`), and the system display face is what the app uses. |

`package.json` is `next`, `react`, `react-dom`. If you are about to add a fourth
dependency for something that moves, read
`.claude/skills/clinicos-motion/SKILL.md` first.

### Motion

Two things move, both in pure CSS:

- **Reveals.** `[data-reveal]` rises 14 px on a native scroll-driven animation
  (`animation-timeline: view()`). There is **no JavaScript fallback** — in
  Firefox the content is simply there. That is the right answer for decoration,
  and it is why this site has no client components. The `@supports` test includes
  `animation-range` on purpose, to exclude partial implementations.
- **The hero.** `.rise` plays once on load, staggered with `animationDelay`.

Everything is off under `prefers-reduced-motion: reduce`, and the page reads
identically with all of it disabled. The one looping animation on the site is the
recording dot in the mock-up, because a recording indicator that does not move is
not saying anything; under reduced motion it becomes a static visible dot rather
than freezing mid-fade.

**The waveform in that mock-up is static on purpose.** The old site animated 34
bar heights, which is a layout pass per bar per frame. Animate `transform` or
nothing.

### Contrast

Every text colour was measured against its ground before it was used:
`--slate-600` body on `--canvas` is 6.7:1, `--teal-600` 5.1:1, `--faint` small
print 5.2:1, white on the primary button's lighter end 5.5:1. **The app's
`--grad-brand` is deliberately not used for buttons here**: its `--teal-500` end
leaves white at 3.9:1, which is fine behind the app's larger labels and not fine
behind a 15 px button. If you add a colour, measure it.

### The screens

`Screens.tsx` holds four rendered mock-ups — Today, recording, review and sign,
and the printed prescription — built from the real app's structure and its own
design system. **They are not screenshots, and the page says so where they
appear.** An interface picture that implies a running system it cannot show is
the kind of thing that gets noticed in a room full of clinicians.

They must also stay *true*. The step bar reads Record / Transcript / Review &
sign because that is what `ConsultWorkflow.tsx` shows, and there is no consent
step because since 20 Sep 2026 there is not one in the app: the clinic accepts
ClinicOS's terms once instead (`CLAUDE.md`, invariant 5). If the app's flow
changes, these change with it.

### The lockup

`Wordmark.tsx`: the ClinicOS tile, "Varaxis" heavy, "ClinicOS" lighter in teal —
the arrangement every Varaxis product uses. On this site the maker is ink rather
than white, because the ground is paper; `.on-dark` puts it back for the footer
and the sign-in panel. The tile's mark (three lines of a note, the last shorter)
must stay in step with `BrandMark.tsx`, which draws the same mark for the favicon
and the share image.

## Contact form and privacy

Every address the site points at lives in `src/site.ts`: the public site URL, the
contact email, the contact form link, and the clinic app's origin. Change them
there, nowhere else.

- **Contact form** is a Tally form ("Talk to ClinicOS"). Responses land in the
  Tally account, not in this repo, and nothing is posted from the site itself.
  The form links back to `/privacy`, so if `SITE_URL` changes, update that link
  in Tally too.
- **`/privacy`** makes specific promises: no cookies, no analytics, no
  third-party scripts, and form responses deleted within 12 months of last
  contact. Adding any tracking or a new form provider means changing that page in
  the same commit, and the 12-month deletion has to actually happen.
- **`SITE_URL`** drives the share-preview image, `robots.txt` and the sitemap. It
  must match the domain the Vercel project actually serves.

`icon`, `apple-icon` and `opengraph-image` are generated at build time with
`next/og` from `src/components/BrandMark.tsx`. That renderer (Satori) supports
only flexbox, inline styles and gradients, so keep the mark inside that subset.

## Content

ClinicOS is positioned as a Varaxis product for clinics and hospitals
internationally — from a single-room practice to a hospital department. It is not
a project about one town.

Every figure is cited inline and traceable to
`docs/ClinicOS_Problem_Statement.md`. Do not add claims the product cannot
support — in particular nothing implying it makes a clinical judgement, which it
must not (`CLAUDE.md`, invariant 1).
