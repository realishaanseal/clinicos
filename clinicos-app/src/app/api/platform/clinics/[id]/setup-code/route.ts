import { NextResponse } from "next/server";
import { countUsers, getTenant, recordAudit, setTenantSetupCode } from "@/lib/db";
import { operatorActor, requireApiOperator } from "@/lib/platform";
import { newSetupCode } from "@/lib/setup-code";

/**
 * A fresh setup code, for a clinic whose first code was lost before anyone
 * used it. Refused once the clinic has an account: from then on, the clinic's
 * own admin adds people, and a lost password is reset by that admin or with
 * the reset-password script — never by reopening setup.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiOperator();
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const clinic = await getTenant(id);
  if (!clinic) return NextResponse.json({ error: "That clinic doesn't exist." }, { status: 404 });
  if ((await countUsers(clinic.id)) > 0) {
    return NextResponse.json(
      { error: "This clinic is already set up. Its own admin adds people and resets passwords." },
      { status: 409 }
    );
  }

  const setup = newSetupCode();
  await setTenantSetupCode(clinic.id, setup.hash);
  await recordAudit(clinic.id, operatorActor(auth.op), "clinic_setup_code", "clinic", clinic.id, "new setup code issued");
  return NextResponse.json({ setupCode: setup.code });
}
