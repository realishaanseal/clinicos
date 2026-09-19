import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/sync-server";
import { applyChanges, applyTombstones, inApplyTransaction, isSyncTable, type ApplyResult } from "@/lib/sync";
import { removeAudio } from "@/lib/audio-store";

export const maxDuration = 60;

/** Most rows a clinic computer sends at once. It sends again for the rest. */
const MAX_ROWS = 500;

/**
 * Changes from a clinic computer, one table (or the deletions) at a time,
 * merged into its clinic by the rules in src/lib/sync.ts. The answer says how
 * many were dealt with, so the computer knows how far it has got.
 */
export async function POST(req: Request) {
  const auth = await requireDevice(req);
  if (auth.denied) return auth.denied;
  const { device, clinic } = auth;

  const body = await req.json().catch(() => null);
  const rows: unknown[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Send at most ${MAX_ROWS} rows at a time.` }, { status: 413 });
  }

  let result: ApplyResult;
  if (body?.table === "SyncTombstone") {
    result = await inApplyTransaction(device.id, () => applyTombstones(clinic.id, rows));
  } else if (isSyncTable(body?.table)) {
    result = await inApplyTransaction(device.id, () => applyChanges(clinic.id, body.table, rows));
  } else {
    return NextResponse.json({ error: "Unknown table." }, { status: 400 });
  }
  // A visit signed on the clinic computer takes its recording here with it.
  for (const p of result.audioToRemove) await removeAudio(p);

  return NextResponse.json({ accepted: result.accepted, conflicts: result.conflicts, serverTime: new Date().toISOString() });
}
