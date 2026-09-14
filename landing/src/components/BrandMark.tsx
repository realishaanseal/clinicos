/**
 * The ClinicOS mark: three lines of a note, the last one shorter, on the product's
 * green glass tile. A record being written.
 *
 * The same mark as the tile in Wordmark.tsx, drawn again here for next/og, which
 * renders with Satori rather than a browser. Satori understands flexbox, inline
 * styles and gradients, and little else, so this component must stay inside that
 * subset. It is used by icon, apple-icon and opengraph-image, never on the page.
 */
export default function BrandMark({ size, rounded = true }: { size: number; rounded?: boolean }) {
  // Proportions match the 32-unit SVG tile in Wordmark.tsx: bars 16, 16 and 10
  // units long, 2.6 thick, 4.7 apart, starting 8 units in.
  const bars = [0.5, 0.5, 0.3125];
  const thickness = Math.max(2, Math.round(size * 0.082));
  const gap = Math.max(2, Math.round(size * 0.066));

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingLeft: Math.round(size * 0.25),
        background: "linear-gradient(135deg, #13705f 0%, #07302a 55%, #021815 100%)",
        borderRadius: rounded ? Math.round(size * 0.25) : 0,
      }}
    >
      {bars.map((w, i) => (
        <div
          key={i}
          style={{
            width: Math.round(size * w),
            height: thickness,
            marginTop: i === 0 ? 0 : gap,
            borderRadius: thickness,
            background: "#e6faf2",
          }}
        />
      ))}
    </div>
  );
}
