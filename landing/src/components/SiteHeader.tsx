"use client";

/**
 * The site header: the Varaxis ClinicOS lockup, the three sections worth jumping
 * to, and the two actions the site offers — sign in to the app, or get in touch.
 * Phones get only Sign in: the row was measured to fit one button from 320 px.
 *
 * Clear over the film at the top of the page, where the opening frames are dark
 * and the lockup reads on its own. Once the page scrolls it takes a smoked-glass
 * band, because further down the film turns bright. The band fades in on a
 * pseudo-element's opacity: backdrop-filter itself is never animated, since that
 * re-blurs the whole region on every frame.
 *
 * Links are written as "/#how" rather than "#how" so they also work from the
 * privacy and not-found pages.
 */

import { useEffect, useState } from "react";
import Wordmark from "./Wordmark";
import { APP_PATH } from "@/site";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#privacy", label: "Your data" },
  { href: "/#tour", label: "The product" },
];

export default function SiteHeader() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const update = () => setStuck(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={stuck ? "site-header is-stuck" : "site-header"}>
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
          <a className="btn btn-ghost btn-sm hide-narrow" href="/#contact">Get in touch</a>
          <a className="btn btn-primary btn-sm" href={APP_PATH}>Sign in</a>
        </div>
      </div>
    </header>
  );
}
