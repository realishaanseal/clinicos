import { ImageResponse } from "next/og";
import BrandMark from "@/components/BrandMark";

export const alt = "ClinicOS. The consultation already happened. The record should too.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The preview card shown when a link to the site is shared. Generated once at
 * build time. Satori renders it, not a browser, so layout is flexbox with inline
 * styles only; the glow is two radial gradients rather than a blur filter,
 * which Satori does not support.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#03060a",
          color: "#eef4f8",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -300,
            right: -220,
            width: 860,
            height: 860,
            display: "flex",
            background: "radial-gradient(circle at 50% 50%, rgba(47,109,246,0.55) 0%, rgba(3,6,10,0) 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -360,
            left: 160,
            width: 940,
            height: 760,
            display: "flex",
            background: "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.26) 0%, rgba(3,6,10,0) 70%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center" }}>
          <BrandMark size={56} />
          <div style={{ marginLeft: 20, fontSize: 36, letterSpacing: -0.5 }}>ClinicOS</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", fontSize: 70, lineHeight: 1.08, letterSpacing: -2 }}>
          <div>The consultation already happened.</div>
          <div style={{ color: "#67e8f9" }}>The record should too.</div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#a3b4c4" }}>
          Local-first clinical documentation · A Varaxis product
        </div>
      </div>
    ),
    size
  );
}
