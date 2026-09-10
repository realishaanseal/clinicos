"use client";

import { motion, useReducedMotion } from "motion/react";
import AnimatedText from "./AnimatedText";

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
    <header className="hero">
      <div className="wrap hero-copy">
        <motion.div className="pill glass" {...rise(0)}>
          <span className="dot" />
          A Varaxis product
        </motion.div>

        <AnimatedText
          as="h1"
          text="The consultation already happened. [[The]] [[record]] [[should]] [[too.]]"
          delay={0.15}
          stagger={0.055}
        />

        <motion.p className="lede" {...rise(0.85)}>
          ClinicOS listens to the consultation you are already having and drafts the
          clinical note. You review it and sign. Everything runs on your own hardware — no
          cloud, no account, no patient data leaving the building.
        </motion.p>

        <motion.div className="cta-row" {...rise(1)}>
          <a className="btn btn-primary" href="#how">See how it works</a>
          <a className="btn btn-ghost" href="#privacy">Where the data lives</a>
        </motion.div>
      </div>
    </header>
  );
}
