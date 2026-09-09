import { NextRequest, NextResponse } from "next/server";
import { exportPatient } from "@/lib/db";

/** Full record for one patient, as JSON. Offered before deletion, because
 *  clinical records carry statutory retention periods — see the warning in
 *  the settings UI. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = exportPatient(id);
  if (!data) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const safe = data.patient.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="clinicos-${safe}-${id.slice(-6)}.json"`,
    },
  });
}
