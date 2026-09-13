import { NextResponse } from "next/server";
import { createBackup } from "@/lib/backup";
import { requireApiUser } from "@/lib/auth";

export async function POST() {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;

  try {
    const file = await createBackup(false);
    return NextResponse.json({ ok: true, ...file });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
