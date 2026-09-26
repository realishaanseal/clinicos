/**
 * The screens shown on the page.
 *
 * These are rendered mock-ups built from the real app's structure and its own
 * design system, not screenshots — and the page says so wherever they appear.
 * An interface picture that implies a running system it cannot show is the kind
 * of thing that gets noticed in a room full of clinicians.
 *
 * Server components: no state, no effects, no JavaScript in the browser. The
 * step bar's labels are the app's real ones (Record, Transcript, Review & sign
 * — ConsultWorkflow.tsx), and there is no consent step, because since
 * 20 Sep 2026 there is not one in the app either: the clinic accepts ClinicOS's
 * terms once instead (CLAUDE.md, invariant 5).
 *
 * The waveform is static. Animating thirty bar heights costs a layout pass per
 * bar per frame, which is the kind of expense this version of the site exists to
 * remove. Only the recording dot moves, because a recording indicator that does
 * not move is not saying anything.
 */

/** Deterministic bar heights: a plausible waveform that never changes between
 *  renders, so the server and the client agree and nothing re-lays-out. */
const WAVE = [
  18, 34, 26, 52, 71, 44, 30, 58, 84, 62, 39, 25, 47, 66, 92, 74, 51, 33, 22, 41,
  63, 88, 69, 45, 28, 37, 56, 77, 59, 36, 24, 43, 61, 48, 31,
];

function Chrome({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ui">
      <div className="ui-bar">
        <i /><i /><i />
        <b>{label}</b>
      </div>
      {children}
    </div>
  );
}

function Nav({ on }: { on: string }) {
  const items = ["Today", "Patients", "Bills", "Follow-ups", "Clinic admin"];
  return (
    <div className="ui-nav" aria-hidden="true">
      <div className="who">Dr A. Sen</div>
      {items.map((i) => (
        <span key={i} className={i === on ? "on" : undefined}>{i}</span>
      ))}
    </div>
  );
}

/** The payoff screen: the draft is back, structured, waiting to be corrected. */
export function ReviewScreen() {
  return (
    <Chrome label="ClinicOS — review and sign">
      <div className="ui-app">
        <Nav on="Today" />
        <div className="ui-main">
          <div className="ui-head">
            <h4>A. Khatun, 34</h4>
            <em>Visit 2 of 2 today</em>
          </div>
          <div className="ui-steps">
            <div className="s done"><b>1</b> Record</div>
            <div className="s done"><b>2</b> Transcript</div>
            <div className="s on"><b>3</b> Review &amp; sign</div>
          </div>
          <div className="ui-fields">
            <div className="ui-field">
              <label>Presenting complaint</label>
              <p>Fever four days, rising in the evening. Dry cough at night.</p>
            </div>
            <div className="ui-field">
              <label>Examination <em>you edited this</em></label>
              <p>Temp 38.4&#176;C. Throat mildly congested. Chest clear on both sides.</p>
            </div>
            <div className="ui-field">
              <label>Plan</label>
              <p>Paracetamol 500 mg, one three times a day after food, 3 days. Warm salt gargle. Return if the fever crosses 39&#176;C.</p>
            </div>
          </div>
          <div className="ui-sign">
            <span>The recording is deleted when you sign.</span>
            <span className="ui-btn">Sign and print</span>
          </div>
        </div>
      </div>
    </Chrome>
  );
}

/** The front desk's day. The point of this one is the row that went wrong. */
export function TodayScreen() {
  const rows: [string, string, string, string][] = [
    ["09:14", "R. Banerjee, 54", "Signed", "ok"],
    ["09:26", "S. Iyer, 31", "Signed", "ok"],
    ["09:38", "A. Khatun, 34", "Draft ready", "ok"],
    ["09:47", "M. Das, 47", "Waiting", "quiet"],
  ];
  return (
    <Chrome label="ClinicOS — today">
      <div className="ui-app">
        <Nav on="Today" />
        <div className="ui-main">
          <div className="ui-head">
            <h4>Today</h4>
            <em>Thursday, 8 consultations</em>
          </div>
          <div className="ui-rows">
            {rows.map(([t, n, s, kind]) => (
              <div className="ui-row" key={n}>
                <span className="t">{t}</span>
                <span className="n">{n}</span>
                <span className={kind === "ok" ? "pill pill-ok" : "pill pill-quiet"}>{s}</span>
              </div>
            ))}
            <div className="ui-row warn">
              <span className="t">08:52</span>
              <span className="n">P. Ghosh, 61</span>
              <span className="pill pill-warn">Stopped at 3:12 — power lost</span>
            </div>
          </div>
          <div className="ui-sign">
            <span>Nothing recorded before it stopped was lost.</span>
            <span className="pill pill-ok">Continue</span>
          </div>
        </div>
      </div>
    </Chrome>
  );
}

/** Recording, with the transcript filling in behind it. */
export function RecordScreen() {
  return (
    <Chrome label="ClinicOS — recording">
      <div className="ui-app">
        <Nav on="Today" />
        <div className="ui-main">
          <div className="ui-steps">
            <div className="s on"><b>1</b> Record</div>
            <div className="s"><b>2</b> Transcript</div>
            <div className="s"><b>3</b> Review &amp; sign</div>
          </div>
          <div className="ui-rec">
            <span className="ui-dot" />
            <div className="ui-wave" aria-hidden="true">
              {WAVE.map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
            <span className="ui-time">04:12</span>
          </div>
          <div className="ui-tx">
            <div className="h">Transcript</div>
            <p><b>Doctor</b> How many days has the fever been there?</p>
            <p><b>Patient</b> Four days. It comes in the evening mostly.</p>
            <p><b>Doctor</b> Any cough, cold, throat pain?</p>
            <p><b>Patient</b> Dry cough at night. No throat pain.</p>
          </div>
          <div className="ui-sign">
            <span>Audio is written to disk in five-second pieces as you talk.</span>
            <span className="pill pill-quiet">Stop</span>
          </div>
        </div>
      </div>
    </Chrome>
  );
}

/** What the patient walks out with. */
export function PrescriptionScreen() {
  return (
    <Chrome label="ClinicOS — prescription">
      <div className="ui-paper">
        <div className="rx-head">
          <div>
            <b>Sen Clinic</b>
            <i>Dr A. Sen, MBBS &middot; Reg. 00000</i>
          </div>
          <div className="rx-mark" aria-hidden="true" />
        </div>
        <div className="rx-meta">
          <div><label>Patient</label>A. Khatun, 34</div>
          <div><label>Date</label>24 Sep 2026</div>
          <div><label>Come back on</label>1 Oct 2026</div>
        </div>
        <div className="rx-body">
          <div className="rx-symbol" aria-hidden="true">Rx</div>
          <ol>
            <li>Paracetamol 500 mg <i>1 tablet, three times a day, after food &mdash; 3 days</i></li>
            <li>Cetirizine 10 mg <i>1 tablet at night &mdash; 5 days</i></li>
            <li>Warm salt-water gargle <i>Twice a day</i></li>
          </ol>
        </div>
        <div className="rx-foot">
          <span>Come back at once if the fever crosses 39&#176;C or breathing gets hard.</span>
          <div className="rx-sign">Signed &middot; Dr A. Sen</div>
        </div>
      </div>
    </Chrome>
  );
}
