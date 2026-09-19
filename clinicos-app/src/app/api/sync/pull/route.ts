import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/sync-server";
import { isSyncTable, page, readChanges, readTombstones, type Cursor } from "@/lib/sync";

export const maxDuration = 60;

const MAX_ROWS = 300;
/** Well under the host's response limit, whatever the rows hold. */
const MAX_BYTES = 2_500_000;

/**
 * What changed in one table of the clinic since the computer's cursor, oldest
 * first, leaving out what that computer sent itself. `more` says to ask again
 * from `next`.
 */
export async function POST(req: Request) {
  const auth = await requireDevice(req);
  if (auth.denied) return auth.denied;
  const { device, clinic } = auth;

  const body = await req.json().catch(() => null);
  const after: Cursor | null =
    body?.after && typeof body.after.at === "string" && typeof body.after.key === "string" ? body.after : null;
  const limit = Math.min(Math.max(Number(body?.limit) || 200, 1), MAX_ROWS);

  const entries =
    body?.table === "SyncTombstone"
      ? await readTombstones(clinic.id, after, limit, device.id)
      : isSyncTable(body?.table)
        ? await readChanges(clinic.id, body.table, after, limit, device.id)
        : null;
  if (!entries) return NextResponse.json({ error: "Unknown table." }, { status: 400 });

  const { rows, next, more } = page<unknown>(entries, limit, MAX_BYTES);
  return NextResponse.json({ rows, next: next ?? after, more, serverTime: new Date().toISOString() });
}
