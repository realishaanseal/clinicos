import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import BrandMark from "@/components/BrandMark";

export const alt = "Varaxis ClinicOS. The consultation already happened. The record should too.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The preview card shown when a link to the site is shared. Generated once at
 * build time, over a still from the same film as the site's backdrop.
 *
 * Satori renders it, not a browser: layout is flexbox with inline styles only,
 * and it reads JPEG and PNG but not WebP, which is why scripts/backdrop.py makes
 * this still as a JPEG. It lives in media/, not public/, because nothing on the
 * site links to it.
 */
export default function OpengraphImage() {
  const still = readFileSync(join(process.cwd(), "media", "og-backdrop.jpg")).toString("base64");

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
          background: "#010604",
          color: "#eef6f3",
          position: "relative",
        }}
      >
        <img
          src={`data:image/jpeg;base64,${still}`}
          alt=""
          width={1200}
          height={630}
          style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630 }}
        />
        {/* The same job as the veil on the site: the film shows on the right, and
            the copy on the left sits on near-black. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            background: "linear-gradient(90deg, rgba(1,6,4,0.94) 0%, rgba(1,6,4,0.8) 50%, rgba(1,6,4,0.15) 100%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center" }}>
          <BrandMark size={56} />
          <div style={{ display: "flex", marginLeft: 20, fontSize: 38, letterSpacing: -0.8 }}>
            {/* The renderer ships one regular-weight face, so fontWeight alone does
                nothing. A hairline stroke in the same colour gives "Varaxis" the
                heavier weight it has in the lockup on the site. */}
            <span style={{ fontWeight: 700, color: "#ffffff", WebkitTextStroke: "1.2px #ffffff" }}>Varaxis</span>
            <span style={{ marginLeft: 12, color: "#a6f0d6" }}>ClinicOS</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", fontSize: 68, lineHeight: 1.08, letterSpacing: -2 }}>
          <div>The consultation already happened.</div>
          <div style={{ color: "#a6f0d6" }}>The record should too.</div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#b4c7c1" }}>
          Local-first clinical documentation
        </div>
      </div>
    ),
    size
  );
}
