# Varaxis brand assets

The company's official logo, as supplied by Ishaan on 20 September 2026. This
folder is the source of truth: take a copy from here rather than re-exporting
from a deck or a screenshot.

| File | What it is | Use it on |
|---|---|---|
| `varaxis-logo-on-dark.jpg` | The mark and wordmark in brushed metal, with the tagline **Ideas into Impact**, on black | dark backgrounds |
| `varaxis-logo-on-light.jpg` | The same mark and wordmark in black, **without** the tagline, on white | light backgrounds |

Both are 2000 × 2000 JPEG.

## Things worth knowing before you use one

- **They are JPEGs, so the background is baked in.** Neither can sit on a colour
  that is not its own black or white. Anything needing transparency — a tile, a
  favicon, a watermark, a placement over the website's film — needs a PNG or SVG
  that does not exist yet. Ask Ishaan rather than cutting one out of these.
- **Only the dark version carries the tagline.** They are not the same lockup at
  two colours; do not treat them as interchangeable when the tagline matters.
- **This is Varaxis, not ClinicOS.** ClinicOS has its own mark — three lines of a
  note on a green tile — drawn in code in `landing/src/components/Wordmark.tsx`
  and `BrandMark.tsx`. The website's header uses the Varaxis ClinicOS *lockup*,
  which is that tile plus type, not these files. Nothing on the website or in the
  clinic app reads this folder today.
- **Public copy is Varaxis, international, clinics of every size.** Wherever these
  go, the surrounding words follow that; no founder's name. See
  CONTEXT.md §1.

## Deploys

`/brand` is in `.vercelignore`, alongside `docs/` and `artifacts/`: it is the
company's asset store, not part of either site. A site that needs the logo takes
its own copy into `landing/public/`, because a Vercel build for the website only
sees the `landing` directory.
