/**
 * The ClinicOS mark: three lines of a note, the last one shorter, on the brand
 * gradient. A record being written.
 *
 * Drawn for next/og, which renders with Satori rather than a browser. Satori
 * understands flexbox, inline styles and gradients, and little else, so this
 * component must stay inside that subset. It is used by icon, apple-icon and
 * opengraph-image, never rendered on the page itself.
 */
export default function BrandMark({ size, rounded = true }: { size: number; rounded?: boolean }) {
  const bars = [0.56, 0.56, 0.36];
  const thickness = Math.max(2, Math.round(size * 0.1));
  const gap = Math.max(2, Math.round(size * 0.08));

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingLeft: Math.round(size * 0.22),
        background: "linear-gradient(135deg, #2f6df6 0%, #22d3ee 100%)",
        borderRadius: rounded ? Math.round(size * 0.24) : 0,
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
            background: "#ffffff",
          }}
        />
      ))}
    </div>
  );
}
