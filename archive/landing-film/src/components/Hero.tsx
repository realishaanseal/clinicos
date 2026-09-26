"use client";

/**
 * The opening section. The Varaxis ClinicOS lockup sits in the header directly
 * above it, so the hero carries no badge of its own and the headline is the first
 * thing read.
 */

import { motion, useReducedMotion } from "motion/react";
import AnimatedText from "./AnimatedText";
import { APP_PATH } from "@/site";

export default function Hero() {
  const reduced = useReducedMotion();

  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 22, filter: "blur(8px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section id="hero" className="hero">
      <div className="wrap hero-copy">
        <AnimatedText
          as="h1"
          text="The consultation already happened. [[The]] [[record]] [[should]] [[too.]]"
          delay={0.1}
          stagger={0.055}
        />

        <motion.p className="lede" {...rise(0.8)}>
          ClinicOS listens to the consultation you are already having and drafts the
          clinical note. You review it and sign. Run it on your own hardware and no patient
          data leaves the building, or sign in to the online prototype and try it now.
        </motion.p>

        <motion.div className="cta-row" {...rise(0.95)}>
          <a className="btn btn-primary" href={APP_PATH}>Sign in</a>
          <a className="btn btn-ghost" href="#contact">Get in touch</a>
        </motion.div>
      </div>
    </section>
  );
}
