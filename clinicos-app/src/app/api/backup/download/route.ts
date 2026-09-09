import { NextRequest, NextResponse } from "next/server";
import { createBackup, backupPathFor, BACKUP_DIR } from "@/lib/backup";
import { readFile } from "fs/promises";
import path from "path";

/** Download an existing backup by name, or make a fresh one and send that. */
export async function GET(req: NextRequest) {
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
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(buf.length),
    },
  });
}
