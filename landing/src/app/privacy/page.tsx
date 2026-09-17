import type { Metadata } from "next";
import { CONTACT_EMAIL, CONTACT_FORM_URL } from "@/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What the ClinicOS website and contact form collect, why, how long it is kept, and how to have it deleted.",
};

/**
 * Plain-language privacy note for the website and the contact form.
 *
 * Every sentence here is a commitment someone can hold us to. In particular:
 * "no cookies, no analytics, no third-party scripts" stops being true the day
 * an analytics or chat script is added, and the 12-month deletion window has to
 * actually be honoured in the Tally account. Change this page in the same commit
 * as anything that changes what the site collects.
 */
export default function Privacy() {
  return (
    <main id="content" className="narrow doc">
      <a className="back-link" href="/">&larr; ClinicOS</a>

      <article className="glass glass-lit doc-panel">
        <h1>Privacy</h1>
        <p className="updated">Last updated 17 September 2026</p>

        <h2>The short version</h2>
        <p>
          This website does not track you. The only personal details we collect are the ones you
          type into the contact form, and we use them only to reply to you. Neither the website nor
          the form is a place for patient information.
        </p>

        <h2>This website</h2>
        <p>
          The site sets no cookies, runs no analytics and loads no third-party scripts. It is
          hosted by Vercel. The one exception is signing in to ClinicOS itself, at /app: that sets a
          single cookie to keep you signed in, and only once you sign in. Like any web host, Vercel processes technical details such as your IP
          address to deliver pages and protect the site from abuse.
        </p>

        <h2>The contact form</h2>
        <p>
          The <a href={CONTACT_FORM_URL}>contact form</a> runs on <a href="https://tally.so/help/gdpr">Tally</a>,
          a form service based in Belgium. Tally encrypts responses and stores them in Europe. When
          you fill it in, we receive:
        </p>
        <ul>
          <li>your name and email address</li>
          <li>a phone or WhatsApp number, if you give one</li>
          <li>your role, and the name of your clinic, hospital or organisation if you give it</li>
          <li>your city and country, and roughly how many clinicians work there</li>
          <li>what you are interested in, and anything else you choose to write</li>
        </ul>
        <p>
          We use these details to reply to you about ClinicOS. If you ask for updates, we send those
          as well, and nothing more. We do not sell your details, share them, or add you to any list
          you did not ask to join.
        </p>

        <h2>How long we keep it</h2>
        <p>
          We delete your response when you ask us to. If you don&rsquo;t ask, we delete it within
          12 months of our last contact with you.
        </p>

        <h2>Your choices</h2>
        <p>
          You can ask to see what we hold about you, correct it, or have it deleted. Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will do it.
        </p>

        <h2>Patient information</h2>
        <p>
          Please don&rsquo;t send patient details through the form or by email. ClinicOS can run on
          the clinic&rsquo;s own hardware, where patient data stays. It also runs online as a
          prototype, with records kept in a database in India; that version is for trying ClinicOS
          with made-up patients, not for real patient records yet. How ClinicOS handles patient data
          is set out in the agreement each clinic signs.
        </p>

        <h2>Changes</h2>
        <p>When this page changes, the date at the top changes with it.</p>
      </article>
    </main>
  );
}
