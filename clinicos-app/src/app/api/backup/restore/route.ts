import { NextRequest, NextResponse } from "next/server";
import { restoreFromBuffer } from "@/lib/backup";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("backup") as File | null;
  const confirm = String(form.get("confirm") || "");

  if (!file) return NextResponse.json({ error: "No file supplied" }, { status: 400 });

  // Restoring destroys the current records. Same discipline as deletion.
  if (confirm.trim().toUpperCase() !== "RESTORE") {
    return NextResponse.json(
      { error: 'Type RESTORE to confirm. Nothing was changed.' },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await restoreFromBuffer(buf);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
