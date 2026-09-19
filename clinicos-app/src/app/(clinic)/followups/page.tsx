import { requireUser } from "@/lib/auth";
import { followUpsDue, localDay, RECALL_DAYS } from "@/lib/db";
import { getBillingSettings, getClinicName } from "@/lib/clinic";
import { clinicDayAt, fmtDate } from "@/lib/time";
import FollowUps from "@/components/FollowUps";

export const dynamic = "force-dynamic";

/** Follow-up recall (backlog #10): who was asked back and has not come. */
export default async function FollowUpsPage() {
  const user = await requireUser("frontdesk");
  const today = localDay();
  const due = await followUpsDue(user.clinicId, today, localDay(clinicDayAt(-RECALL_DAYS)));

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">{fmtDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1>Follow-ups</h1>
        <p className="sub">
          Patients whose doctor asked them back by now, and who have not been back. They stay here for {RECALL_DAYS} days.
        </p>
      </div>
      <FollowUps
        initial={due.map(({ signedAt, ...r }) => (void signedAt, r))}
        today={today}
        clinicName={await getClinicName(user.clinicId)}
        template={(await getBillingSettings(user.clinicId)).recallMessage}
      />
    </div>
  );
}
