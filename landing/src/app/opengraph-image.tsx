import { ImageResponse } from "next/og";
import BrandMark from "@/components/BrandMark";

export const alt = "Varaxis ClinicOS. The consultation already happened. The record should too.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The preview card shown when a link to the site is shared, generated once at
 * build time.
 *
 * It is drawn, not composited over a photograph: the previous version laid this
 * over a still from the film and had to ship that JPEG in the repository. Now it
 * is the site's own paper, one teal wash, and the lockup — so the share card
 * matches the page it opens, and there is no image file to keep in step.
 *
 * Satori renders this, not a browser: flexbox with inline styles and gradients
 * only, and it ships one regular-weight face, so a hairline stroke in the same
 * colour is what gives "Varaxis" its weight.
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
          padding: "76px 84px",
          background: "#f7f9f8",
          backgroundImage:
            "radial-gradient(760px 420px at 8% 0%, rgba(15,118,110,0.14), rgba(247,249,248,0) 70%)",
          color: "#4b5a57",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <BrandMark size={54} />
          <div style={{ display: "flex", marginLeft: 20, fontSize: 37, letterSpacing: -0.8 }}>
            <span style={{ fontWeight: 700, color: "#0c1413", WebkitTextStroke: "1.1px #0c1413" }}>Varaxis</span>
            <span style={{ marginLeft: 12, color: "#0f766e" }}>ClinicOS</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", fontSize: 66, lineHeight: 1.08, letterSpacing: -2.4, color: "#0c1413" }}>
          <div>The consultation already happened.</div>
          <div style={{ color: "#0b5e55" }}>The record should too.</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", fontSize: 25 }}>
          <div style={{ display: "flex", width: 44, height: 2, background: "#5eccc2", marginRight: 18 }} />
          Local-first clinical documentation
        </div>
      </div>
    ),
    size
  );
}
