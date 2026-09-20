import Hero from "@/components/Hero";
import Reveal from "@/components/Reveal";
import AnimatedText from "@/components/AnimatedText";
import CountUp from "@/components/CountUp";
import ProductTour from "@/components/ProductTour";
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

const STEPS = [
  { t: "Consent", d: "Ask the patient, in their language, in about fifteen seconds. Nothing records until they say yes." },
  { t: "Record", d: "Just have the consultation. Audio is saved as it happens, so a crash or a flat battery costs you nothing." },
  { t: "Transcribe", d: "Speech becomes text. On your own hardware, the audio never leaves the room. Patients who switch languages mid-sentence are handled as standard." },
  { t: "Draft", d: "A structured note comes back from the transcript. It is a draft until you have looked at it." },
  { t: "Review & sign", d: "Check it, sign it, print it. The recording is deleted the moment you sign." },
];

const FEATURES = [
  {
    t: "Crash and offline recovery",
    d: "Audio is saved in short chunks as you record, and the note saves as you go. Whatever stops it, the consultation reappears on the day’s list with the reason: power, network, or a closed tab.",
    icon: "M12 3v9m0 0 3.5-3.5M12 12 8.5 8.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  },
  {
    t: "Backup and restore",
    d: "On the clinic’s own computer, a snapshot is taken every day and the last fourteen are kept, one tap to download. Restoring takes a snapshot of what is there first, behind a typed confirmation.",
    icon: "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5",
  },
  {
    t: "Swap the engines, keep the app",
    d: "Speech recognition and drafting sit behind small interfaces. Swap the on-device engine for a hosted one by changing configuration. No code changes, no rebuild.",
    icon: "M8 6h11M8 12h11M8 18h11M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  },
  {
    t: "Complete export, any time",
    d: "Every record exports in an open format on demand. Leaving should take an afternoon, not a migration project and a phone call to us.",
    icon: "M12 15V3m0 12-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  },
  {
    t: "Multilingual by default",
    d: "In most of the world, patients switch language mid-sentence. Transcription was built for that from the start rather than patched for it later.",
    icon: "M4 5h11M9 3v2c0 5-2.5 8-5 9m3-4c0 2.5 3 4.5 6 4.5M13 20l4-9 4 9m-6.5-2h5",
  },
  {
    t: "Every edit is kept",
    d: "The original draft is never overwritten. Your corrections are stored separately, and the gap between the two tells us how good the drafting actually is.",
    icon: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  },
];

export default function Page() {
  return (
    <>
      <main id="content">
        <Hero />

        <section id="problem">
          <div className="wrap">
            <Reveal>
              <div className="eyebrow">The problem</div>
              <AnimatedText text="Most clinical software costs more time [[than]] [[it]] [[saves.]]" />
              <p className="lede" style={{ marginTop: "1.5rem" }}>
                Hand a clinic an EMR and you have handed the clinician a data-entry job. That is
                why documentation gets abandoned, in well-funded hospitals as much as in small
                practices. The bar for anything worth installing is simple. It has to take less
                attention than paper already does.
              </p>
            </Reveal>

            <Reveal>
              <div className="figures stagger-group" style={{ marginTop: "3rem" }}>
                {FIGURES.map((f) => (
                  <div className="figure glass glass-i glass-lit" key={f.k}>
                    <div className="n">
                      <CountUp value={f.n} />
                      {f.unit && <small>{f.unit}</small>}
                    </div>
                    <div className="k">{f.k}</div>
                    <cite>{f.cite}</cite>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section id="how">
          <div className="wrap">
            <Reveal>
              <div className="eyebrow">How it works</div>
              <AnimatedText text="Five steps. You do [[one]] [[of]] [[them.]]" />
            </Reveal>
            <Reveal>
              <div className="steps stagger-group" style={{ marginTop: "2.8rem" }}>
                {STEPS.map((s, i) => (
                  <div className="step glass glass-i glass-lit" key={s.t}>
                    <div className="i">{i + 1}</div>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section id="privacy">
          <div className="wrap">
            <Reveal>
              <div className="eyebrow">Where the data lives</div>
              <AnimatedText text="Your hardware, or [[online.]] [[You]] [[choose.]]" />
              <p className="lede" style={{ marginTop: "1.5rem" }}>
                Install ClinicOS on the clinic’s own computer and transcription, drafting and every
                record stay there, with no internet needed. Consultation data never crosses a
                network, which turns data residency into a question you do not have to answer. Or
                use it online with nothing to install: records are kept in a database in India, and
                each clinic sees only its own. Or both: a full copy on the clinic’s computer that
                keeps working without internet and stays in step with the online one. The online
                version is a prototype today, so try it with made-up patients.
              </p>
            </Reveal>

            <Reveal>
              <div className="promises stagger-group">
                <div className="promise glass glass-i glass-lit">
                  <span className="tag">Promise</span>
                  <h3>Audio is deleted at signing</h3>
                  <p>You tell the patient the recording will be deleted. We delete it in the code that signs the note, so it cannot be left switched off by mistake.</p>
                </div>
                <div className="promise glass glass-i glass-lit">
                  <span className="tag">Promise</span>
                  <h3>Nothing is ever lost</h3>
                  <p>Audio is saved while you record and the note saves as you go. Lose power mid-consultation and it comes back, with the reason it stopped.</p>
                </div>
                <div className="promise glass glass-i glass-lit">
                  <span className="tag">Promise</span>
                  <h3>No lock-in, ever</h3>
                  <p>Export everything, whenever you want, in an open format. If you decide to leave, you should not have to ask us or hire anyone to get your records out.</p>
                </div>
                <div className="promise negative glass glass-i glass-lit">
                  <span className="tag">Never</span>
                  <h3>No diagnosis, no risk scores, no triage flags</h3>
                  <p>Software that quantifies a physiological parameter to drive a clinical decision is a regulated medical device. ClinicOS carries the record. The judgement stays with you.</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="built">
          <div className="wrap">
            <Reveal>
              <div className="eyebrow">What is built</div>
              <AnimatedText text="The boring half is the half [[that]] [[keeps]] [[you.]]" />
              <p className="lede" style={{ marginTop: "1.5rem" }}>
                Drafting a note from a transcript is the easy part. Whether you are still using
                ClinicOS in six months comes down to what happens when the power cuts, when a
                database needs restoring, and when you want your data back.
              </p>
            </Reveal>
            <Reveal>
              <div className="features stagger-group">
                {FEATURES.map((f) => (
                  <div className="feature glass glass-i glass-lit" key={f.t}>
                    <div className="fi">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={f.icon} strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                    <h3>{f.t}</h3>
                    <p>{f.d}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <ProductTour />

        <section id="scale">
          <div className="wrap">
            <Reveal>
              <div className="eyebrow">Who it is for</div>
              <AnimatedText text="One room, or [[one]] [[hospital.]]" />
              <p className="lede" style={{ marginTop: "1.5rem" }}>
                Build for the smallest clinic and you have built for everyone. One clinician who
                is also the receptionist and the record-keeper, no IT department to call, two
                minutes a patient. Clear that bar and a hospital department is straightforward.
                The constraint never changes: the record has to cost less attention than paper.
              </p>
            </Reveal>
          </div>
        </section>

        <section id="status">
          <div className="narrow">
            <Reveal>
              <div className="glass glass-lit" style={{ padding: "clamp(1.8rem, 4vw, 3rem)" }}>
                <div className="eyebrow">Where this is</div>
                <AnimatedText text="Early, and we will [[say]] [[so.]]" />
                <p className="lede" style={{ marginTop: "1.4rem" }}>
                  The full flow works today. Consent, recording, transcription, drafting, review,
                  signing, printing, backup, restore. It runs on a clinic computer, and online as a
                  prototype you can sign in to. What we have not done is
                  sit with twenty clinicians and find out whether documentation is really one of
                  their top three problems. Until we have, everything on this page is a
                  hypothesis, and we would rather tell you that now than later.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* No <Reveal> in this section or the next. They are the last on the page,
            and the scroll-driven reveal only completes once an element has
            travelled a third of the way up the viewport. Near the end of the
            document it cannot, so on tall screens the text and buttons here
            stayed faded. */}
        <section id="contact">
          <div className="wrap">
            <div className="eyebrow">Get in touch</div>
            <AnimatedText text="Run a clinic or a hospital department? [[Talk]] [[to]] [[us.]]" />
            <p className="lede" style={{ marginTop: "1.5rem" }}>
              Tell us where you work and what you need. We read every message and reply by email.
            </p>
            <div className="cta-row" style={{ justifyContent: "flex-start" }}>
              <a className="btn btn-primary" href={CONTACT_FORM_URL}>Send us a message</a>
              <a className="btn btn-ghost" href={`mailto:${CONTACT_EMAIL}`}>Email us</a>
            </div>
            <p className="contact-note">
              Please leave patient details out of your message.{" "}
              <a href="/privacy">How we handle what you send</a>.
            </p>
          </div>
        </section>

        <section id="signin">
          <div className="wrap">
            <div className="eyebrow">Sign in</div>
            <AnimatedText text="The prototype is [[open.]] [[Try]] [[it.]]" />
            <p className="lede" style={{ marginTop: "1.5rem" }}>
              ClinicOS runs online as a working prototype: the front desk’s list, consultations,
              notes and prescriptions, with separate sign-ins for doctors, front desk and clinic
              admins. Sign in with the account your clinic set up for you, and use made-up patients
              while it is a prototype.
            </p>
            <div className="cta-row" style={{ justifyContent: "flex-start" }}>
              <a className="btn btn-primary" href={APP_PATH}>Sign in to ClinicOS</a>
              <a className="btn btn-ghost" href="#contact">Need an account? Talk to us</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <div className="row">
            <div>
              <a className="lockup-link" href="/" aria-label="Varaxis ClinicOS, home">
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
