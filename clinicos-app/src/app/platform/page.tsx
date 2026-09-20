import Link from "next/link";
import { requireOperator } from "@/lib/platform";
import { listTenants, tenantOverviews } from "@/lib/db";
import { parseClinicTerms, termsInForce } from "@/lib/terms";
import { PLANS, clinicPath, parseFeatures } from "@/lib/tenant";
import { publicAppUrl } from "@/lib/public-url";
import { fmtDate } from "@/lib/time";
import NewClinicForm from "@/components/NewClinicForm";
import { IcArrow } from "@/components/Icons";

export const dynamic = "force-dynamic";

/** Every clinic on ClinicOS, with what it bought and how much it uses it —
 *  counts only. */
export default async function PlatformHome() {
  await requireOperator();
  const base = await publicAppUrl();
  const counts = await tenantOverviews();
  const clinics = (await listTenants()).map((t) => {
    const usage = counts.get(t.id);
    return {
      t,
      usage: { people: usage?.people ?? 0, patients: usage?.patients ?? 0, signed: usage?.signed ?? 0, lastActivityAt: usage?.lastActivityAt ?? null },
      // A clinic that has not accepted the terms cannot record; from here that
      // looks like a clinic that bought ClinicOS and never used it.
      canRecord: termsInForce(parseClinicTerms(usage?.terms)),
      features: parseFeatures(t.features),
    };
  });

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Varaxis platform</div>
        <h1>Clinics</h1>
        <p className="sub">
          Each clinic has its own address and sees only its own records. Create one when a clinic buys ClinicOS.
        </p>
      </div>

      <NewClinicForm base={base} plans={PLANS} />

      <div className="card flush">
        <div className="card-head">
          <span className="title">{clinics.length} clinic{clinics.length === 1 ? "" : "s"}</span>
          <span className="muted">counts only — the console never opens a record</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="week">
            <thead>
              <tr>
                <th>Clinic</th>
                <th>Plan</th>
                <th>Status</th>
                <th className="num">People</th>
                <th className="num">Patients</th>
                <th className="num">Visits signed</th>
                <th>Last active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clinics.map(({ t, usage, features, canRecord }) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    <div className="dim mono">{clinicPath(t.slug)}</div>
                  </td>
                  <td>
                    {PLANS[t.plan] ?? t.plan}
                    {features.localSync && <div className="dim" style={{ fontSize: 12.5 }}>with clinic computer sync</div>}
                  </td>
                  <td>
                    {usage.people === 0 ? (
                      <span className="pill draft">Waiting for setup</span>
                    ) : t.status === "suspended" ? (
                      <span className="pill draft">Paused</span>
                    ) : canRecord ? (
                      <span className="pill signed">Active</span>
                    ) : (
                      <span className="pill draft" title="Recording is off until the clinic accepts ClinicOS's terms">
                        Terms not accepted
                      </span>
                    )}
                  </td>
                  <td className="num">{usage.people}</td>
                  <td className="num">{usage.patients}</td>
                  <td className="num">{usage.signed}</td>
                  <td className="dim">{usage.lastActivityAt ? fmtDate(usage.lastActivityAt, { day: "numeric", month: "short" }) : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/platform/clinics/${t.id}`} aria-label={`Manage ${t.name}`}>
                      <IcArrow size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
