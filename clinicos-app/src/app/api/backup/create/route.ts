import { NextResponse } from "next/server";
import { createBackup, BACKUP_FILES_AVAILABLE, BACKUP_FILES_ONLINE_MESSAGE } from "@/lib/backup";
import { requireApiUser } from "@/lib/auth";

export async function POST() {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  if (!BACKUP_FILES_AVAILABLE) return NextResponse.json({ error: BACKUP_FILES_ONLINE_MESSAGE }, { status: 400 });

  try {
    const file = await createBackup(false);
    return NextResponse.json({ ok: true, ...file });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
