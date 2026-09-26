import { ReviewScreen, TodayScreen, RecordScreen, PrescriptionScreen } from "@/components/Screens";
import Wordmark from "@/components/Wordmark";
import { APP_PATH, CONTACT_EMAIL, CONTACT_FORM_URL } from "@/site";

/**
 * Positioning: ClinicOS is a Varaxis product for clinics and hospitals
 * internationally — from a single-room practice to a hospital department. Not a
 * project about one town.
 *
 * Every figure is cited inline and comes from docs/ClinicOS_Problem_Statement.md.
 * Nothing here claims the product makes a clinical judgement, because it does
 * not and legally must not — see invariant 1 in CLAUDE.md.
 *
 * There is not a single client component on this page. Reveals are native CSS
 * scroll-driven animations; `data-reveal` is the only thing marking them.
 */

const FIGURES = [
  {
    n: "48s",
    unit: "– 22.5m",
    k: "How long a primary care consultation lasts, depending on where you are. Documentation has to work at both ends.",
    cite: "Irving et al., BMJ Open, 2017",
  },
  {
    n: "~½",
    unit: "world",
    k: "Of the world lives in one of the 18 countries where a consultation runs five minutes or less.",
    cite: "Irving et al., BMJ Open, 2017",
  },
  {
    n: "49.2",
    unit: "%",
    k: "Of physician office time goes on records and desk work. Face time with patients gets 27.0%.",
    cite: "Sinsky et al., Annals of Internal Medicine, 2016",
  },
  {
    n: "1–2",
    unit: "hrs",
    k: "Of documentation after clinic hours, every day. That work follows the clinician home.",
    cite: "Sinsky et al., Annals of Internal Medicine, 2016",
  },
];

/** The app's own three steps, in the app's own words (ConsultWorkflow.tsx). */
const STEPS = [
  {
    t: "Record",
    d: "Have the consultation you were going to have anyway. Audio is written to disk in five-second pieces while you talk, so a crash, a closed tab or a flat battery costs you nothing.",
  },
  {
    t: "Transcript",
    d: "Speech becomes text when you stop. On the clinic’s own computer it never leaves the room. Patients who change language mid-sentence are handled as standard, not as an edge case.",
  },
  {
    t: "Review & sign",
    d: "A structured note is already waiting. Correct anything that is off, sign, print. The recording is deleted the moment you sign, and your corrections are kept apart from the original draft.",
  },
];

const SHAPES = [
  {
    tag: "Option one",
    t: "On the clinic’s own computer",
    d: "Transcription, drafting and every record stay on that machine. No internet is needed and consultation data never crosses a network, which turns data residency into a question you do not have to answer.",
    foot: "SQLite on the clinic’s disk. Accounts exist on that laptop only.",
  },
  {
    tag: "Option two",
    t: "Online, nothing to install",
    d: "Sign in and work. Records are kept in a database in Mumbai and each clinic sees only its own — never another clinic’s, and never Varaxis, whose console shows counts and nothing else.",
    foot: "A prototype today: use made-up patients until we say otherwise.",
  },
  {
    tag: "Option three",
    t: "Both, kept in step",
    d: "A full copy on the clinic’s computer that keeps working when the line goes down, and catches up with the online one when it comes back. Recordings never travel between them.",
    foot: "Included in the plans that carry it, switched on per clinic.",
  },
];

const PROMISES = [
  {
    tag: "Promise",
    t: "Audio is deleted at signing",
    d: "You tell the patient the recording will be deleted. We delete it inside the code that signs the note, so it cannot be left switched off by mistake, and a recording never syncs anywhere.",
  },
  {
    tag: "Promise",
    t: "Nothing is ever lost",
    d: "Audio is saved while you record and the note saves as you type. Lose power mid-consultation and it comes back on the day’s list, with the reason it stopped.",
  },
  {
    tag: "Promise",
    t: "No lock-in, ever",
    d: "Export every record in an open format whenever you want. If you decide to leave, that should take an afternoon — not a migration project and a phone call to us.",
  },
  {
    tag: "Never",
    t: "No diagnosis, no risk scores, no triage flags",
    d: "Software that quantifies a physiological parameter to drive a clinical decision is a regulated medical device. ClinicOS carries the record and shows you the numbers. The judgement stays with you.",
    dark: true,
  },
];

const FEATURES = [
  {
    t: "Crash and offline recovery",
    d: "Audio is saved in short pieces as you record, and the note saves as you go. Whatever stops it, the consultation reappears on the day’s list with the reason: power, network, or a closed tab.",
    icon: "M12 3v9m0 0 3.5-3.5M12 12 8.5 8.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  },
  {
    t: "Backup and restore",
    d: "On the clinic’s own computer a snapshot is taken every day and the last fourteen are kept, one tap to download. Restoring snapshots what is already there first, behind a typed confirmation.",
    icon: "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5",
  },
  {
    t: "The front desk’s half of the day",
    d: "The day’s list, bills and printed receipts, and the patients a doctor asked back — with a WhatsApp reminder the desk sends in one tap. The half of a clinic that is not the consultation.",
    icon: "M4 7h16M4 12h16M4 17h10M18 15v4m2-2h-4",
  },
  {
    t: "The patient’s own copy",
    d: "One tap after signing shares exactly the signed prescription to the patient’s phone, in English, Bengali or Hindi — never the transcript, the recording or the draft.",
    icon: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm4 15h2",
  },
  {
    t: "Multilingual by default",
    d: "In most of the world patients change language mid-sentence. Transcription was built for that from the start rather than patched for it later, and the prescription’s timing card prints in the patient’s language.",
    icon: "M4 5h11M9 3v2c0 5-2.5 8-5 9m3-4c0 2.5 3 4.5 6 4.5M13 20l4-9 4 9m-6.5-2h5",
  },
  {
    t: "Every edit is kept",
    d: "The original draft is never overwritten. Your corrections are stored separately, and the gap between the two is how we measure whether the drafting is actually any good.",
    icon: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  },
  {
    t: "Swap the engines, keep the app",
    d: "Speech recognition and drafting sit behind small interfaces. Swap the on-device engine for a hosted one by changing configuration — no code changes, no rebuild, no new version to install.",
    icon: "M8 6h11M8 12h11M8 18h11M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  },
  {
    t: "Complete export, any time",
    d: "Every record, every bill, every signed note, in an open format, on demand. Leaving should cost an afternoon.",
    icon: "M12 15V3m0 12-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  },
  {
    t: "Accounts that match a clinic",
    d: "The doctor, the front desk and whoever runs the place see different things, checked on the server and not by hiding a link. A front-desk account cannot open a clinical note at all.",
    icon: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 8.5v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.7a3.5 3.5 0 0 1 0 6.6",
  },
];

/** Small line icons for the three claims under the hero. */
const HERO_FACTS = [
  { t: "Works with no internet at all", icon: "M5 12.5a7 7 0 0 1 14 0M8.5 15.5a3.5 3.5 0 0 1 7 0M12 19h.01" },
  { t: "Audio deleted the moment you sign", icon: "M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" },
  { t: "Every record exportable, any time", icon: "M12 15V3m0 12-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Page() {
  return (
    <>
      <main id="content">
        {/* --- Hero ------------------------------------------------------- */}
        <section className="hero" id="hero">
          <div className="wrap">
            <h1 className="rise" style={{ animationDelay: "40ms" }}>
              The consultation already happened.{" "}
              <span className="accent">The record should too.</span>
            </h1>
            <p className="lede rise" style={{ animationDelay: "140ms" }}>
              ClinicOS listens to the consultation you are already having and drafts the clinical
              note. You read it, correct what is off, and sign. Run it on the clinic’s own computer
              and nothing leaves the building — or sign in to the online prototype and see it in a
              minute.
            </p>
            <div className="cta-row rise" style={{ animationDelay: "220ms" }}>
              <a className="btn btn-primary" href={APP_PATH}>Sign in to ClinicOS</a>
              <a className="btn btn-ghost" href="#contact">Talk to us</a>
            </div>
            <div className="hero-facts rise" style={{ animationDelay: "300ms" }}>
              <ul>
                {HERO_FACTS.map((f) => (
                  <li key={f.t}><Icon d={f.icon} />{f.t}</li>
                ))}
              </ul>
            </div>
            <div className="hero-shot rise" style={{ animationDelay: "380ms" }}>
              <ReviewScreen />
            </div>
          </div>
        </section>

        {/* --- The problem ------------------------------------------------ */}
        <section className="ruled" id="problem">
          <div className="wrap">
            <div data-reveal>
              <div className="eyebrow">The problem</div>
              <h2>Most clinical software costs more time <span className="accent">than it saves.</span></h2>
              <p className="lede" style={{ marginTop: "1.4rem" }}>
                Hand a clinic an EMR and you have handed the clinician a data-entry job. That is why
                documentation gets abandoned, in well-funded hospitals as much as in small practices.
                The bar for anything worth installing is simple: it has to take less attention than
                paper already does.
              </p>
            </div>
            <div className="figures" data-reveal>
              {FIGURES.map((f) => (
                <div className="figure" key={f.k}>
                  <div className="n">{f.n}{f.unit && <small>{f.unit}</small>}</div>
                  <div className="k">{f.k}</div>
                  <cite>{f.cite}</cite>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- How it works ----------------------------------------------- */}
        <section className="ruled tinted" id="how">
          <div className="wrap">
            <div data-reveal>
              <div className="eyebrow">How it works</div>
              <h2>Three steps. You do <span className="accent">the last one.</span></h2>
            </div>
            <div className="steps" data-reveal>
              {STEPS.map((s, i) => (
                <div className="step card card-i" key={s.t}>
                  <div className="i">STEP {i + 1}</div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              ))}
            </div>
            <p className="note" style={{ marginTop: "1.6rem", maxWidth: "70ch" }} data-reveal>
              There is no consent screen to click through per patient. The clinic accepts ClinicOS’s
              terms once — undertaking to tell every patient before recording, and to record no one
              who says no — and until it has, the server refuses to record at all.{" "}
              <a href="/terms">The terms a clinic accepts</a>.
            </p>
          </div>
        </section>

        {/* --- The product ------------------------------------------------ */}
        <section className="ruled" id="product">
          <div className="wrap">
            <div data-reveal>
              <div className="eyebrow">The product</div>
              <h2>What it looks like <span className="accent">at the desk.</span></h2>
              <p className="note" style={{ marginTop: "1rem" }}>
                Rendered mock-ups of the real screens, built from the app’s own design system. Not
                screenshots.
              </p>
            </div>

            <div className="showcase">
              <div className="shot-row" data-reveal>
                <div className="shot-copy">
                  <span className="i">01 / TODAY</span>
                  <h3>The day, and anything that went wrong in it</h3>
                  <p>
                    Who is waiting, who is drafted, who is signed. A consultation that stopped early
                    is on the list with the reason it stopped and everything it had already captured.
                  </p>
                </div>
                <TodayScreen />
              </div>

              <div className="shot-row flip" data-reveal>
                <div className="shot-copy">
                  <span className="i">02 / RECORDING</span>
                  <h3>Press record and forget about it</h3>
                  <p>
                    Audio goes to disk in five-second pieces while you talk. Transcription starts the
                    moment you stop, so the draft is usually waiting before the patient has stood up.
                  </p>
                </div>
                <RecordScreen />
              </div>

              <div className="shot-row" data-reveal>
                <div className="shot-copy">
                  <span className="i">03 / PRESCRIPTION</span>
                  <h3>What the patient actually walks out with</h3>
                  <p>
                    The clinic’s own letterhead, the medicines as the doctor wrote them, when to come
                    back, and what to come back at once for — in the doctor’s words, never generated.
                    The same thing can go to the patient’s phone in one tap.
                  </p>
                </div>
                <PrescriptionScreen />
              </div>
            </div>
          </div>
        </section>

        {/* --- Where the data lives --------------------------------------- */}
        <section className="ruled tinted" id="data">
          <div className="wrap">
            <div data-reveal>
              <div className="eyebrow">Where the data lives</div>
              <h2>Your computer, online, <span className="accent">or both.</span></h2>
              <p className="lede" style={{ marginTop: "1.4rem" }}>
                This is a choice you make, not one we make for you — and it is the same software
                either way, configured differently.
              </p>
            </div>

            <div className="shapes" data-reveal>
              {SHAPES.map((s) => (
                <div className="shape card card-i" key={s.t}>
                  <div className="tag">{s.tag}</div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                  <div className="foot">{s.foot}</div>
                </div>
              ))}
            </div>

            <div className="promises" data-reveal>
              {PROMISES.map((p) => (
                <div className={p.dark ? "promise card card-i dark" : "promise card card-i"} key={p.t}>
                  <div className="tag">{p.tag}</div>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- What is built ---------------------------------------------- */}
        <section className="ruled" id="built">
          <div className="wrap">
            <div data-reveal>
              <div className="eyebrow">What is built</div>
              <h2>The boring half is the half <span className="accent">that keeps you.</span></h2>
              <p className="lede" style={{ marginTop: "1.4rem" }}>
                Drafting a note from a transcript is the easy part. Whether you are still using
                ClinicOS in six months comes down to what happens when the power cuts, when a
                database needs restoring, and when you want your data back.
              </p>
            </div>
            <div className="features" data-reveal>
              {FEATURES.map((f) => (
                <div className="feature card card-i" key={f.t}>
                  <div className="fi"><Icon d={f.icon} /></div>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- Who it is for, and where this is --------------------------- */}
        <section className="ruled" id="scale">
          <div className="wrap">
            <div data-reveal>
              <div className="eyebrow">Who it is for</div>
              <h2>One room, or <span className="accent">one hospital.</span></h2>
              <p className="lede" style={{ marginTop: "1.4rem" }}>
                Build for the smallest clinic and you have built for everyone: one clinician who is
                also the receptionist and the record-keeper, no IT department to call, two minutes a
                patient. Clear that bar and a hospital department is straightforward. The constraint
                never changes — the record has to cost less attention than paper.
              </p>
            </div>

            <div className="aside-panel" style={{ marginTop: "2.8rem" }} data-reveal>
              <div className="eyebrow">Where this is</div>
              <h2 style={{ fontSize: "clamp(1.5rem, 2.6vw, 1.95rem)" }}>
                Early, and we will <span className="accent">say so.</span>
              </h2>
              <p className="lede" style={{ marginTop: "1.1rem" }}>
                The whole flow works today: recording, transcription, drafting, review, signing,
                printing, the day’s list, bills and receipts, follow-up reminders, the patient’s own
                copy on their phone, backup and restore. It runs on a clinic computer, and online as
                a prototype you can sign in to. What we have not done is sit with twenty clinicians
                and find out whether documentation is really one of their top three problems. Until
                we have, everything on this page is a hypothesis — and we would rather tell you that
                now than later.
              </p>
            </div>
          </div>
        </section>

        {/* --- Talk to us, or sign in ------------------------------------- */}
        <section className="ruled tinted" id="contact">
          <div className="wrap">
            <div data-reveal>
              <div className="eyebrow">Get in touch</div>
              <h2>Start a conversation, <span className="accent">or start a visit.</span></h2>
            </div>

            <div className="close-grid" data-reveal>
              <div className="panel card">
                <div className="tag">For clinics and hospitals</div>
                <h3>Tell us where you work</h3>
                <p>
                  What you run, how many clinicians, and what documentation costs you today. We read
                  every message and reply by email. Please leave patient details out of it —{" "}
                  <a href="/privacy">what we do with what you send</a>.
                </p>
                <div className="cta-row">
                  <a className="btn btn-primary" href={CONTACT_FORM_URL}>Send us a message</a>
                  <a className="btn btn-ghost" href={`mailto:${CONTACT_EMAIL}`}>Email us</a>
                </div>
              </div>

              <div className="panel dark" id="signin">
                <div className="tag">The prototype is open</div>
                <h3>Sign in and use it</h3>
                <p>
                  The front desk’s list, consultations, notes and prescriptions, with separate
                  sign-ins for doctors, the front desk and whoever runs the clinic. Use the account
                  your clinic set up for you — and made-up patients, while it is a prototype.
                </p>
                <div className="cta-row">
                  <a className="btn btn-on-dark" href={APP_PATH}>Sign in to ClinicOS</a>
                  <a className="btn btn-quiet-dark" href={CONTACT_FORM_URL}>Need an account?</a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <div className="row">
            <div>
              <a className="lockup-link on-dark" href="/" aria-label="Varaxis ClinicOS, home">
                <Wordmark id="foot" />
              </a>
              <div className="foot-tag">Local-first clinical documentation.</div>
            </div>
            <nav aria-label="Footer">
              <ul className="foot-links">
                <li><a href={CONTACT_FORM_URL}>Send us a message</a></li>
                <li><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
                <li><a href="/privacy">Privacy</a></li>
                <li><a href="/terms">Terms</a></li>
                <li><a href={APP_PATH}>Sign in</a></li>
              </ul>
            </nav>
          </div>
          <p className="foot-note">Not a medical device. Makes no clinical judgement.</p>
          <ol className="sources">
            <li>Irving G. et al., &ldquo;International variations in primary care physician consultation time: a systematic review of 67 countries,&rdquo; <em>BMJ Open</em> 7(10), 2017.</li>
            <li>Sinsky C. et al., &ldquo;Allocation of Physician Time in Ambulatory Practice: A Time and Motion Study in 4 Specialties,&rdquo; <em>Annals of Internal Medicine</em>, 2016.</li>
          </ol>
        </div>
      </footer>
    </>
  );
}
