import { NextRequest, NextResponse } from "next/server";
import { createBackup, backupPathFor, BACKUP_DIR, BACKUP_FILES_AVAILABLE, BACKUP_FILES_ONLINE_MESSAGE } from "@/lib/backup";
import { recordAudit } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

/** Download an existing backup by name, or make a fresh one and send that. */
export async function GET(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  if (!BACKUP_FILES_AVAILABLE) return NextResponse.json({ error: BACKUP_FILES_ONLINE_MESSAGE }, { status: 400 });

  const name = req.nextUrl.searchParams.get("name");

  let filePath: string | null;
  let fileName: string;

  if (name) {
    filePath = backupPathFor(name);
    if (!filePath) return NextResponse.json({ error: "No such backup" }, { status: 404 });
    fileName = name;
  } else {
    const made = await createBackup(false);
    filePath = path.join(BACKUP_DIR, made.name);
    fileName = made.name;
  }

  const buf = await readFile(filePath);
  // Every copy of the whole database that leaves this machine is logged.
  await recordAudit(auth.user, "backup_download", "backup", null, fileName);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(buf.length),
    },
  });
}
