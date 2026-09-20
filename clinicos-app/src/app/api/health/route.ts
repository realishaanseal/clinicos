import { NextResponse } from "next/server";
import { BACKEND, q } from "@/lib/sql";

export const dynamic = "force-dynamic";

/**
 * Is ClinicOS up, and does its database answer? For an uptime check, and for
 * telling at a glance which version a copy is running.
 *
 * Open on purpose, and deliberately empty: no counts, no clinic, no record —
 * nothing here says anything about anyone. The commit is the one Vercel built;
 * on a clinic computer there is none.
 */
export async function GET() {
  const started = Date.now();
  let db: "ok" | "unreachable" = "ok";
  try {
    await q().get(`SELECT 1 AS ok`);
  } catch {
    db = "unreachable";
  }
  return NextResponse.json(
    {
      ok: db === "ok",
      db,
      backend: BACKEND,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      ms: Date.now() - started,
    },
    { status: db === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
