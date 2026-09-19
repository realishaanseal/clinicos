import { NextRequest, NextResponse } from "next/server";
import { getTenant, getTenantByDomain, getTenantBySlug, recordAudit, updateTenant, type TenantPatch } from "@/lib/db";
import { isUniqueViolation } from "@/lib/sql";
import { operatorActor, requireApiOperator } from "@/lib/platform";
import { readClinicInput } from "@/lib/platform-rules";
import { PLANS, parseFeatures } from "@/lib/tenant";

/**
 * Change what a clinic has: its name, ID, plan, what the plan switches on, its
 * own web address, and whether it is active or paused. Every change is written
 * to the clinic's own activity log as well, so the clinic can see that Varaxis
 * made it.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiOperator();
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const clinic = await getTenant(id);
  if (!clinic) return NextResponse.json({ error: "That clinic doesn't exist." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const read = readClinicInput(body, false);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  const input = read.input;

  const patch: TenantPatch = {};
  const changed: string[] = [];
  if (input.name !== undefined && input.name !== clinic.name) { patch.name = input.name; changed.push("name"); }
  if (input.slug !== undefined && input.slug !== clinic.slug) {
    const other = await getTenantBySlug(input.slug);
    if (other && other.id !== clinic.id) {
      return NextResponse.json({ error: "Another clinic already has that ID. Pick another." }, { status: 409 });
    }
    patch.slug = input.slug;
    changed.push(`ID (now ${input.slug})`);
  }
  if (input.plan !== undefined && input.plan !== clinic.plan) { patch.plan = input.plan; changed.push(`plan (now ${PLANS[input.plan]})`); }
  if (input.localSync !== undefined) {
    const features = parseFeatures(clinic.features);
    if (features.localSync !== input.localSync) {
      patch.features = JSON.stringify({ ...features, localSync: input.localSync });
      changed.push(input.localSync ? "clinic computer sync switched on" : "clinic computer sync switched off");
    }
  }
  if (input.domain !== undefined && input.domain !== clinic.domain) {
    if (input.domain) {
      const other = await getTenantByDomain(input.domain);
      if (other && other.id !== clinic.id) {
        return NextResponse.json({ error: "Another clinic already uses that web address." }, { status: 409 });
      }
    }
    patch.domain = input.domain;
    changed.push("web address");
  }
  if (input.paidUntil !== undefined && input.paidUntil !== clinic.paidUntil) { patch.paidUntil = input.paidUntil; changed.push("paid until"); }
  if (input.notes !== undefined && input.notes !== clinic.notes) { patch.notes = input.notes; changed.push("notes"); }
  if (input.status !== undefined && input.status !== clinic.status) {
    patch.status = input.status;
    changed.push(input.status === "suspended" ? "paused" : "switched back on");
  }

  if (changed.length === 0) return NextResponse.json({ ok: true });

  try {
    await updateTenant(clinic.id, patch);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Another clinic already has that ID or web address." }, { status: 409 });
    }
    throw e;
  }
  await recordAudit(clinic.id, operatorActor(auth.op), "clinic_update", "clinic", clinic.id, changed.join(", "));
  return NextResponse.json({ ok: true });
}
