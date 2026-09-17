"use client";

/**
 * A pinned product tour: four screens of the app, each entering on a different
 * transition, scrubbed to scroll.
 *
 * The transitions are deliberately different from one another — a mask wipe, a
 * 3D card flip, a slide-and-unblur, a drop-back-and-settle — because four
 * identical fades would read as one long section rather than four screens.
 *
 * These are rendered mock-ups built from the real app's structure, not
 * screenshots. They are labelled as an illustration in the section copy: an
 * interface picture that implies a running system it cannot show is the kind of
 * thing that gets noticed in a room full of clinicians.
 *
 * The stage is held with CSS `position: sticky`, not GSAP's `pin`. Pinning
 * rewrites the element to `position: fixed` and computes its offset from
 * ScrollTrigger's own idea of scroll position — which fights Lenis, and put the
 * whole section 1600px below the viewport when it was tried here. Sticky is
 * handled by the browser's compositor, never disagrees with the scroll library,
 * and needs no refresh handling. The tall parent supplies the scroll distance.
 *
 * Under reduced motion the screens stack vertically as ordinary content.
 */

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const SCREENS = [
  {
    key: "today",
    label: "Today",
    caption: "The day at a glance. Anything that stopped early is flagged, with the reason.",
  },
  {
    key: "consult",
    label: "Consultation",
    caption: "Take consent, hit record, get on with the consultation. Audio is written to disk as you go.",
  },
  {
    key: "note",
    label: "Review",
    caption: "The draft comes back structured. Correct anything that is off. Every correction is kept.",
  },
  {
    key: "script",
    label: "Prescription",
    caption: "Sign it and print. The recording is deleted the moment you do.",
  },
];

function Screen({ kind }: { kind: string }) {
  if (kind === "today") {
    return (
      <div className="mock">
        <div className="mock-bar"><span /><span /><span /></div>
        <div className="mock-body">
          <div className="mock-stats">
            <div className="mock-stat"><b>18</b><i>consultations</i></div>
            <div className="mock-stat"><b>1h 12m</b><i>documentation time saved</i></div>
            <div className="mock-stat"><b>0</b><i>lost</i></div>
          </div>
          <div className="mock-list">
            {[
              ["09:14", "R. Banerjee, 54", "Signed"],
              ["09:21", "S. Iyer, 31", "Signed"],
              ["09:28", "A. Khatun, 6", "Draft ready for review"],
            ].map(([t, n, st]) => (
              <div className="mock-row" key={n}>
                <span className="tick" /><span className="r-t">{t}</span><span className="r-n">{n}</span><span className="r-s">{st}</span>
              </div>
            ))}
            <div className="mock-row warn">
              <span className="tick warn" /><span className="r-t">09:36</span><span className="r-n">M. Das, 47</span>
              <span className="r-s">Stopped at 3:12 — power lost. Nothing missing.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === "consult") {
    return (
      <div className="mock">
        <div className="mock-bar"><span /><span /><span /></div>
        <div className="mock-body">
          <div className="mock-steps">
            {["Consent", "Record", "Draft", "Sign"].map((s, i) => (
              <div className={`mock-step${i === 1 ? " on" : ""}`} key={s}>{s}</div>
            ))}
          </div>
          <div className="mock-rec">
            <span className="rec-dot" />
            <div className="rec-wave">{Array.from({ length: 34 }).map((_, i) => <i key={i} style={{ animationDelay: `${i * 0.06}s` }} />)}</div>
            <span className="rec-time">04:12</span>
          </div>
          <div className="mock-transcript">
            <div className="mt-head">Transcript</div>
            <div className="mt-lines">
              <p><b>Doctor</b> How long has the fever been there?</p>
              <p><b>Patient</b> Three days. It comes in the evening mostly.</p>
              <p><b>Doctor</b> Any cough, cold, throat pain?</p>
              <p><b>Patient</b> Dry cough at night. No throat pain.</p>
              <p className="live"><b>Doctor</b> Let me have a look at your throat<span className="caret" /></p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === "note") {
    return (
      <div className="mock">
        <div className="mock-bar"><span /><span /><span /></div>
        <div className="mock-body">
          {[
            ["Presenting complaint", "Fever 3 days, evening rise. Dry cough at night.", false],
            ["History", "No chest pain, no breathlessness. No known drug allergy.", false],
            ["Examination", "Temp 38.4\u00b0C. Throat mildly congested. Chest clear.", true],
            ["Plan", "Paracetamol 500 mg as needed. Fluids and rest. Review in 3 days, sooner if breathless.", true],
          ].map(([k, v, edited]) => (
            <div className="mock-field" key={k as string}>
              <label>
                {k as string}
                {edited ? <em>edited</em> : null}
              </label>
              <p>{v as string}</p>
            </div>
          ))}
          <div className="mock-edit">2 corrections saved against the draft</div>
        </div>
      </div>
    );
  }
  return (
    <div className="mock paper">
      <div className="mock-body">
        <div className="rx-head">
          <div>
            <b>Demo Clinic</b>
            <i>Dr. A. Demo &middot; MBBS &middot; Reg. 00000</i>
          </div>
          <div className="rx-mark" />
        </div>

        <div className="rx-meta">
          <span><label>Patient</label>A. Khatun, 6 y, F</span>
          <span><label>Date</label>14 Feb 2026</span>
          <span><label>Weight</label>19 kg</span>
        </div>

        <div className="rx-rx">
          <div className="rx-symbol">&#8478;</div>
          <ol>
            <li><b>Paracetamol syrup 250 mg/5 ml</b><i>5 ml when fever is above 38&deg;C, up to 4 times a day</i></li>
            <li><b>ORS sachet</b><i>One sachet in 200 ml water, after loose stools</i></li>
          </ol>
        </div>

        <div className="rx-advice">
          <label>Advice</label>
          Fluids and rest. Return in 3 days if the fever has not settled, or sooner if breathing becomes difficult.
        </div>

        <div className="rx-foot">
          <span className="rx-sign">Signed 09:31 &middot; recording deleted</span>
          <span className="rx-scribble" />
        </div>
      </div>
    </div>
  );
}

export default function ProductTour() {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced || !root.current) return;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const screens = gsap.utils.toArray<HTMLElement>(".tour-screen");
      const caps = gsap.utils.toArray<HTMLElement>(".tour-cap");

      const tl = gsap.timeline({
        scrollTrigger: {
          // The element itself, not a selector: gsap.context() scopes selector
          // strings to the root's *descendants*, so ".tour" matched nothing here
          // and the whole timeline silently did nothing.
          trigger: root.current!,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.9,
        },
      });

      // Each screen leaves on its own effect and the next arrives on another.
      screens.forEach((el, i) => {
        if (i === 0) return;
        const at = i - 1;
        const prev = screens[i - 1];

        // outgoing
        const outs = [
          { yPercent: -14, scale: 0.9, opacity: 0, filter: "blur(10px)" },
          { rotateY: -28, xPercent: -22, opacity: 0, transformPerspective: 1000 },
          { xPercent: -30, opacity: 0, filter: "blur(14px)" },
        ];
        tl.to(prev, { ...outs[(i - 1) % outs.length], duration: 0.55, ease: "power2.in" }, at);
        tl.to(caps[i - 1], { opacity: 0, y: -16, duration: 0.4, ease: "power2.in" }, at);

        // incoming — a different effect per screen
        const ins = [
          // 2: 3D card flip
          { from: { rotateY: 34, xPercent: 26, opacity: 0, transformPerspective: 1000 }, to: { rotateY: 0, xPercent: 0, opacity: 1 } },
          // 3: slide + unblur
          { from: { xPercent: 34, opacity: 0, filter: "blur(16px)" }, to: { xPercent: 0, opacity: 1, filter: "blur(0px)" } },
          // 4: drop back and settle
          { from: { scale: 1.22, yPercent: 12, opacity: 0 }, to: { scale: 1, yPercent: 0, opacity: 1 } },
        ];
        const spec = ins[(i - 1) % ins.length];
        tl.fromTo(el, spec.from, { ...spec.to, duration: 0.6, ease: "power3.out" }, at + 0.42);
        tl.fromTo(caps[i], { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, at + 0.55);
      });
    }, root);

    return () => ctx.revert();
  }, [reduced]);

  return (
    <section id="tour" className="tour" ref={root}>
      <div className="tour-stage">
        <div className="wrap tour-inner">
          <div className="tour-head">
            <div className="eyebrow">The product</div>
            <h2>Four screens, start to signed.</h2>
            <p className="tour-note">Illustration of the interface — not a live system.</p>
          </div>

          <div className="tour-screens">
            {SCREENS.map((s, i) => (
              <div className="tour-screen glass glass-lit" key={s.key} style={{ zIndex: SCREENS.length - i }}>
                <Screen kind={s.key} />
              </div>
            ))}
          </div>

          <div className="tour-caps">
            {SCREENS.map((s) => (
              <div className="tour-cap" key={s.key}>
                <b>{s.label}</b>
                <span>{s.caption}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
