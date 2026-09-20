import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOperator } from "@/lib/platform";
import { getTenant, tenantUsage } from "@/lib/db";
import { getClinicTerms } from "@/lib/clinic";
import { termsInForce } from "@/lib/terms";
import { PLANS, clinicPath, parseFeatures } from "@/lib/tenant";
import { publicAppUrl } from "@/lib/public-url";
import { fmt } from "@/lib/time";
import ClinicEditForm from "@/components/ClinicEditForm";
import DevicesPanel from "@/components/DevicesPanel";
import { listDevices } from "@/lib/sync-server";
import { appPath } from "@/lib/base-path";

export const dynamic = "force-dynamic";

export default async function PlatformClinicPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOperator();
  const { id } = await params;
  const t = await getTenant(id);
  if (!t) notFound();
  const usage = await tenantUsage(t.id);
  // Whether the clinic can record at all: its own acceptance of the terms,
  // which only it can give. Counts and a date — still never a record.
  const terms = await getClinicTerms(t.id);
  const features = parseFeatures(t.features);
  const base = await publicAppUrl();

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="eyebrow">
          <Link href="/platform">Clinics</Link> · {t.slug}
        </div>
        <h1>{t.name}</h1>
        <p className="sub">
          <span className="mono">{`${base}${clinicPath(t.slug)}`}</span>
          {t.domain && (
            <>
              {" "}· also <span className="mono">{t.domain}</span>
            </>
          )}
        </p>
      </div>

      <div className="card">
        <dl className="kv" style={{ marginBottom: 0 }}>
          <div><dt>Plan</dt><dd>{PLANS[t.plan] ?? t.plan}</dd></div>
          <div><dt>Clinic computer sync</dt><dd>{features.localSync ? "Included" : "Not included"}</dd></div>
          <div><dt>Status</dt><dd>{usage.people === 0 ? "Waiting for setup" : t.status === "suspended" ? "Paused" : "Active"}</dd></div>
          <div>
            <dt>Recording</dt>
            <dd>
              {termsInForce(terms) && terms
                ? `On — terms accepted by ${terms.byName || "the clinic"} on ${fmt(terms.at, { day: "numeric", month: "short", year: "numeric" })}`
                : "Off until the clinic accepts ClinicOS's terms, in its own Clinic admin"}
            </dd>
          </div>
          <div><dt>Paid until</dt><dd>{t.paidUntil ?? "—"}</dd></div>
          <div><dt>People</dt><dd>{usage.people}</dd></div>
          <div><dt>Patients</dt><dd>{usage.patients}</dd></div>
          <div><dt>Visits</dt><dd>{usage.consults} ({usage.signed} signed)</dd></div>
          <div><dt>Last active</dt><dd>{usage.lastActivityAt ? fmt(usage.lastActivityAt, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</dd></div>
          <div><dt>Created</dt><dd>{fmt(t.createdAt, { day: "numeric", month: "short", year: "numeric" })}</dd></div>
        </dl>
      </div>

      <ClinicEditForm
        clinic={{
          id: t.id,
          name: t.name,
          slug: t.slug,
          plan: t.plan,
          localSync: features.localSync,
          domain: t.domain ?? "",
          paidUntil: t.paidUntil ?? "",
          notes: t.notes ?? "",
          status: t.status,
        }}
        plans={PLANS}
        awaitingSetup={usage.people === 0}
        base={base}
      />

      {features.localSync && (
        <DevicesPanel
          devices={(await listDevices(t.id)).map(({ keyHash, ...d }) => (void keyHash, d))}
          endpoint={appPath(`/api/platform/clinics/${t.id}/devices`)}
          address={`${base}${clinicPath(t.slug)}`}
        />
      )}
    </div>
  );
}
