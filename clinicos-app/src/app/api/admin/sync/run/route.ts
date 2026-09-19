import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { SYNC_CLIENT_ENABLED, getSyncStatus, syncNow } from "@/lib/sync-client";

export const maxDuration = 300;

/** Sync now, and wait for it: the Sync now button. */
export async function POST() {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  if (!SYNC_CLIENT_ENABLED) return NextResponse.json({ error: "Not on this copy of ClinicOS." }, { status: 404 });
  try {
    const report = await syncNow();
    return NextResponse.json({ ok: true, report, status: await getSyncStatus() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), status: await getSyncStatus() },
      { status: 502 }
    );
  }
}
