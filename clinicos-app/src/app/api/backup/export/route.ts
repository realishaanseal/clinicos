import { NextResponse } from "next/server";
import { exportEverything } from "@/lib/db";

/** Everything, as JSON. Readable without ClinicOS or SQLite. */
export async function GET() {
  const data = exportEverything();
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="clinicos-full-export-${day}.json"`,
    },
  });
}
