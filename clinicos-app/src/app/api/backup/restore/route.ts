import { NextRequest, NextResponse } from "next/server";
import { restoreFromBuffer } from "@/lib/backup";
import { countUsers, getUserRow, recordAudit, reinsertUserRow } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;

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

  // Accounts live in the same database, so a restore brings back whatever
  // accounts the backup held. A backup from before accounts existed holds none,
  // which would leave nobody able to sign in and /setup open to whoever reaches
  // the laptop first. Keep the person doing the restore.
  const restorer = await getUserRow(auth.user.id);

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await restoreFromBuffer(buf);

  if (result.ok) {
    if (await countUsers() === 0 && restorer) await reinsertUserRow(restorer);
    // Written into the restored database, so the log that survives the restore
    // still records that it happened.
    await recordAudit(auth.user, "backup_restore", "backup", null, file.name);
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
