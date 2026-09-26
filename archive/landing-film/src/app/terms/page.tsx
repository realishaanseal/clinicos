import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/site";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "What ClinicOS does and does not do, what a clinic undertakes when it uses it, where records are kept, and how a clinic leaves with everything.",
};

/**
 * The terms a clinic uses ClinicOS under, in plain language.
 *
 * Every line here must match what the product actually does. The clinic's
 * undertakings are word for word the ones it accepts inside the app
 * (clinicos-app/src/lib/terms.ts): change one and change the other, in the same
 * commit. Where a clinic has signed an agreement with Varaxis, that agreement
 * governs; this page is what applies otherwise.
 */
export default function Terms() {
  return (
    <main id="content" className="narrow doc">
      <a className="back-link" href="/">&larr; ClinicOS</a>

      <article className="glass glass-lit doc-panel">
        <h1>Terms</h1>
        <p className="updated">Last updated 20 September 2026</p>

        <h2>The short version</h2>
        <p>
          ClinicOS writes down the consultation the doctor is already having. It never decides
          anything clinical. The clinic tells its patients that consultations are recorded, records
          nobody who says no, and owns every record it makes — and can take all of it out, at any
          time, in a format anyone can read.
        </p>

        <h2>What ClinicOS does</h2>
        <p>
          It records a consultation, writes a transcript, drafts a structured note from it, and
          prints a prescription once the doctor has read the note, corrected it and signed. It also
          keeps the day&rsquo;s list, patient records, bills and receipts, and follow-up reminders.
        </p>

        <h2>What ClinicOS does not do</h2>
        <p>
          It does not diagnose, triage, score, rank or advise. It produces no risk badges and no
          &ldquo;needs attention&rdquo; flags of its own. Nothing it drafts is clinical advice, and
          nothing it shows is a second opinion. The doctor is responsible for the note they sign and
          for the care they give; the signed note is the record, not the draft.
        </p>

        <h2>What the clinic undertakes</h2>
        <p>These are the terms a clinic accepts inside ClinicOS, once, before it can record:</p>
        <ul>
          <li>
            ClinicOS records a consultation only to write its note and prescription. The recording is
            deleted when the doctor signs, and is never used to train anything.
          </li>
          <li>
            Before recording, the clinic tells each patient that the consultation is recorded and
            why, and that saying no changes nothing about their care. For a child, it asks their
            parent or guardian.
          </li>
          <li>
            The clinic never records anyone who says no: it writes the note by hand instead. A
            patient can ask it to stop at any time.
          </li>
          <li>The doctor reads and corrects every note before signing it.</li>
          <li>
            The records are the clinic&rsquo;s: it can export all of them at any time, and Varaxis
            never opens them.
          </li>
        </ul>

        <h2>Where records are kept</h2>
        <p>
          A clinic can run ClinicOS on its own computer, where nothing leaves the building, or online
          as a service, where its records are kept in a database in India, or both, kept in step. The
          clinic decides which. Online, one clinic never sees another clinic&rsquo;s records, and
          Varaxis&rsquo;s own console shows counts only — never a patient, a note or a prescription.
        </p>
        <p>
          Under India&rsquo;s Digital Personal Data Protection Act the clinic is the data fiduciary
          for its patients&rsquo; data; Varaxis processes it on the clinic&rsquo;s instructions and
          for nothing else. Where ClinicOS online uses other services — hosting, the database, and a
          speech-to-text service — they are listed in the clinic&rsquo;s agreement.
        </p>

        <h2>The prescription a patient can read on their phone</h2>
        <p>
          A doctor may share a signed prescription with the patient. The patient chooses their
          language, agrees to the portal&rsquo;s terms themselves, and signs in with their phone
          number and a code printed on the prescription. They see exactly the printed prescription —
          never the recording, the transcript, the draft or the corrections — and can remove it or
          delete their account whenever they like. The clinic can stop sharing at any time.
        </p>

        <h2>Leaving</h2>
        <p>
          A clinic can export every patient, consultation, correction and bill as one open file,
          whenever it likes, including while its subscription is paused or ending. There is no
          export fee and no lock-in.
        </p>

        <h2>Paying</h2>
        <p>
          Varaxis sets a clinic up with its plan, and invoices it separately; ClinicOS itself takes
          no payment from clinics or patients. If a subscription lapses, consultations and the
          day&rsquo;s list stop, while whoever manages the clinic can still sign in and export
          everything.
        </p>

        <h2>While ClinicOS online is a prototype</h2>
        <p>
          The online copy is for trying ClinicOS with made-up patients. It says so on every screen,
          and it is not yet for real patient records. A clinic running ClinicOS on its own computer
          is not affected by this.
        </p>

        <h2>Changes</h2>
        <p>
          When these terms change, the date at the top changes with them, and a clinic is asked to
          accept the new version inside ClinicOS before it records again. Questions, or a copy of the
          agreement: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </article>
    </main>
  );
}
