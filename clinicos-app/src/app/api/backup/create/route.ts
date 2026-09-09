import { NextResponse } from "next/server";
import { createBackup } from "@/lib/backup";

export async function POST() {
  try {
    const file = await createBackup(false);
    return NextResponse.json({ ok: true, ...file });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
