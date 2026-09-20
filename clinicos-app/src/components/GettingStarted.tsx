import Link from "next/link";
import { IcCheck } from "./Icons";

export type Step = { label: string; done: boolean; hint: string; href?: string };

/**
 * What a clinic still has to do (backlog #34). It appears on Clinic admin
 * while anything is missing and disappears for good once everything is done —
 * a checklist nobody can finish is furniture, not help.
 */
export default function GettingStarted({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">Getting started</span>
        <span className="muted">
          {done} of {steps.length} done
        </span>
      </div>
      <ul className="steps-list">
        {steps.map((s) => (
          <li key={s.label} className={s.done ? "done" : ""}>
            <span className="tick" aria-hidden>
              {s.done ? <IcCheck size={13} /> : ""}
            </span>
            <span>
              <strong>{s.label}</strong>
              <span className="visually-hidden">{s.done ? " — done" : " — still to do"}</span>
              <span className="hint">{s.hint}</span>
            </span>
            {!s.done && s.href && (
              <Link className="button-link" href={s.href}>
                Open
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
