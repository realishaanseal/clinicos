import { NextRequest, NextResponse } from "next/server";
import { FIRST_CLINIC_ID, countUsers } from "@/lib/db";
import { PrototypeRefusal, SYNC_CLIENT_ENABLED, SyncError, connect, syncNow } from "@/lib/sync-client";

export const maxDuration = 300;

/**
 * A new clinic computer for a clinic that already uses ClinicOS online: instead
 * of setting up a new clinic, fetch the clinic's records and accounts, and
 * sign in with the same username and password as online.
 *
 * Only while this computer has no accounts — the same window /setup has. The
 * key, made by the clinic's admin online, is what proves the clinic wants it.
 */
export async function POST(req: NextRequest) {
  if (!SYNC_CLIENT_ENABLED) return NextResponse.json({ error: "Not on this copy of ClinicOS." }, { status: 404 });
  if ((await countUsers(FIRST_CLINIC_ID)) > 0) {
    return NextResponse.json({ error: "ClinicOS is already set up on this computer. Connect it from Clinic admin." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  try {
    const hello = await connect(String(body.url ?? ""), String(body.key ?? ""), null, body.madeUpOnly === true);
    const report = await syncNow();
    if ((await countUsers(FIRST_CLINIC_ID)) === 0) {
      return NextResponse.json(
        { error: `Connected to ${hello.clinic.name}, but it has no accounts yet. Set the clinic up online first.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, clinic: hello.clinic, fetched: report.fetched, redirect: "/login" });
  } catch (e) {
    if (e instanceof PrototypeRefusal) return NextResponse.json({ error: e.message, prototype: true }, { status: 409 });
    if (e instanceof SyncError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
