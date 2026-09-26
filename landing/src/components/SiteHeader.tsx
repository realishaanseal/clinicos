/**
 * The site header: the Varaxis ClinicOS lockup, three places worth jumping to,
 * and the two actions the site offers.
 *
 * A server component with no state. The previous header listened to scroll to
 * decide how opaque to be, because it sat over a film whose brightness changed
 * as the page moved. This one sits on paper, so it is the same from the first
 * pixel to the last: canvas at 88% with a blur behind it and a hairline under
 * it, held by CSS `position: sticky`. No JavaScript reaches the browser.
 *
 * Links are written "/#how" rather than "#how" so they also work from the
 * privacy, terms and not-found pages.
 */

import Wordmark from "./Wordmark";
import { APP_PATH } from "@/site";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#product", label: "The product" },
  { href: "/#data", label: "Where data lives" },
];

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap site-header-row">
        <a className="lockup-link" href="/" aria-label="Varaxis ClinicOS, home">
          <Wordmark id="head" />
        </a>
        <nav aria-label="Main">
          <ul className="site-nav">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="site-header-cta">
          <a className="btn btn-ghost btn-sm hide-narrow" href="/#contact">Talk to us</a>
          <a className="btn btn-primary btn-sm" href={APP_PATH}>Sign in</a>
        </div>
      </div>
    </header>
  );
}
