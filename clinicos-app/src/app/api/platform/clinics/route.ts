import { NextRequest, NextResponse } from "next/server";
import { createTenant, getTenantByDomain, getTenantBySlug, markSettingSeeded, recordAudit, setSettings } from "@/lib/db";
import { isUniqueViolation } from "@/lib/sql";
import { operatorActor, requireApiOperator } from "@/lib/platform";
import { readClinicInput } from "@/lib/platform-rules";
import { newSetupCode } from "@/lib/setup-code";
import { PLANS } from "@/lib/tenant";

/**
 * Create a clinic when it buys ClinicOS. Returns its one-time setup code, shown
 * to the operator once and never stored: only its hash is kept, and it stops
 * working the moment the clinic's first account exists.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiOperator();
  if (auth.denied) return auth.denied;

  const body = await req.json().catch(() => ({}));
  const read = readClinicInput(body, true);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  const input = read.input;

  if (await getTenantBySlug(input.slug!)) {
    return NextResponse.json({ error: "Another clinic already has that ID. Pick another." }, { status: 409 });
  }
  if (input.domain && (await getTenantByDomain(input.domain))) {
    return NextResponse.json({ error: "Another clinic already uses that web address." }, { status: 409 });
  }

  const setup = newSetupCode();
  let clinic;
  try {
    clinic = await createTenant({
      slug: input.slug!,
      name: input.name!,
      plan: input.plan!,
      features: JSON.stringify({ localSync: input.localSync ?? false }),
      domain: input.domain ?? null,
      setupCodeHash: setup.hash,
      paidUntil: input.paidUntil ?? null,
      notes: input.notes ?? null,
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Another clinic already has that ID or web address." }, { status: 409 });
    }
    throw e;
  }
  // Printed on prescriptions until the clinic changes it in Clinic admin.
  await setSettings(clinic.id, { clinic_name: clinic.name });
  await markSettingSeeded(clinic.id, "clinic_name");
  await recordAudit(
    clinic.id,
    operatorActor(auth.op),
    "clinic_create",
    "clinic",
    clinic.id,
    `${clinic.name} (${clinic.slug}), ${PLANS[clinic.plan]}${input.localSync ? ", clinic computer sync" : ""}`
  );

  return NextResponse.json({ clinic: { id: clinic.id, slug: clinic.slug, name: clinic.name }, setupCode: setup.code });
}
