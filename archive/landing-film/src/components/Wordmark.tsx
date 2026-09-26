/**
 * The Varaxis product lockup: the product's tile, "Varaxis" in heavy white, and
 * the product's name in its own colour. Every Varaxis product is set this way, so
 * the family reads as one. ClinicOS's colour is the mint of the film behind the
 * site.
 *
 * The tile carries the ClinicOS mark — three lines of a note, the last one shorter
 * — and must stay in step with BrandMark.tsx, which draws the same mark for the
 * favicon and share image. The type is the system display face, because the site
 * loads no webfonts (see CLAUDE.md).
 *
 * `id` keeps the SVG gradient ids unique when the lockup appears twice on a page.
 */
export default function Wordmark({ id }: { id: string }) {
  const tile = `${id}-tile`;
  const sheen = `${id}-sheen`;
  const ink = `${id}-ink`;

  return (
    <span className="lockup">
      <svg className="lockup-tile" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#13705f" />
            <stop offset="0.55" stopColor="#07302a" />
            <stop offset="1" stopColor="#021815" />
          </linearGradient>
          {/* The light catching the top-left of the tile, like the rims in the film. */}
          <radialGradient id={sheen} cx="0.22" cy="0.1" r="0.8">
            <stop offset="0" stopColor="#d7f5ea" stopOpacity="0.42" />
            <stop offset="1" stopColor="#d7f5ea" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={ink} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f4fffa" />
            <stop offset="1" stopColor="#8fe6c8" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill={`url(#${tile})`} />
        <rect width="32" height="32" rx="8" fill={`url(#${sheen})`} />
        <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#a6f0d6" strokeOpacity="0.3" />
        <rect x="8" y="10" width="16" height="2.6" rx="1.3" fill={`url(#${ink})`} />
        <rect x="8" y="14.7" width="16" height="2.6" rx="1.3" fill={`url(#${ink})`} />
        <rect x="8" y="19.4" width="10" height="2.6" rx="1.3" fill={`url(#${ink})`} />
      </svg>
      <span className="lockup-name">
        <span className="lockup-maker">Varaxis</span> <span className="lockup-product">ClinicOS</span>
      </span>
    </span>
  );
}
