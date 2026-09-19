import { NextResponse } from "next/server";
import { exportEverything, recordAudit } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/** Everything, as JSON. Readable without ClinicOS or SQLite. */
export async function GET() {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;

  const data = await exportEverything(auth.user.clinicId);
  const day = new Date().toISOString().slice(0, 10);
  await recordAudit(auth.user.clinicId, auth.user, "export_all", "export", null, `${data.patients.length} patients`);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="clinicos-full-export-${day}.json"`,
    },
  });
}
