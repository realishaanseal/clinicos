import { NextRequest, NextResponse } from "next/server";
import { recordAudit, setSettings } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/** Small enough to load with every prescription, large enough for a sharp
 *  letterhead logo. */
const MAX_BYTES = 100 * 1024;

/**
 * What the file's own bytes say it is. The name and the browser's claimed type
 * are not trusted, and SVG is refused outright: it can carry script, and the
 * logo is shown on every prescription, the patient portal included.
 */
function imageType(b: Buffer): string | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** The clinic's logo on its letterhead (backlog #25). */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get("logo");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "Use an image under 100 KB. A 300 × 300 PNG is plenty." }, { status: 400 });
  }
  const type = imageType(buf);
  if (!type) return NextResponse.json({ error: "Use a PNG, JPEG or WebP image." }, { status: 400 });

  await setSettings(auth.user.clinicId, { clinic_logo: `data:${type};base64,${buf.toString("base64")}` });
  await recordAudit(auth.user.clinicId, auth.user, "settings_update", "clinic", null, "logo changed");
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  await setSettings(auth.user.clinicId, { clinic_logo: "" });
  await recordAudit(auth.user.clinicId, auth.user, "settings_update", "clinic", null, "logo removed");
  return NextResponse.json({ ok: true });
}
