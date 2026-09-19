import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { PrototypeRefusal, SYNC_CLIENT_ENABLED, SyncError, connect, disconnect, getSyncStatus, syncNow } from "@/lib/sync-client";

const notHere = () =>
  NextResponse.json({ error: "Only ClinicOS on a clinic's own computer connects to its clinic online." }, { status: 404 });

/** Where this computer stands with its clinic online. */
export async function GET() {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  if (!SYNC_CLIENT_ENABLED) return notHere();
  return NextResponse.json(await getSyncStatus());
}

/** Connect this computer, with the online address and a key made there. */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  if (!SYNC_CLIENT_ENABLED) return notHere();

  const body = await req.json().catch(() => ({}));
  try {
    const hello = await connect(String(body.url ?? ""), String(body.key ?? ""), auth.user, body.madeUpOnly === true);
    // The first run sends everything here; it goes on after this answer.
    void syncNow().catch(() => {});
    return NextResponse.json({ ok: true, clinic: hello.clinic });
  } catch (e) {
    if (e instanceof PrototypeRefusal) return NextResponse.json({ error: e.message, prototype: true }, { status: 409 });
    if (e instanceof SyncError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

/** Stop keeping in step. Nothing is deleted on either side. */
export async function DELETE() {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  if (!SYNC_CLIENT_ENABLED) return notHere();
  await disconnect(auth.user);
  return NextResponse.json({ ok: true });
}
