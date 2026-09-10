"use client";

/**
 * Word-by-word text reveal.
 *
 * Each word rises out of a blur on a short stagger, so a headline assembles
 * rather than fading in as a block. Words are the right unit: per-character
 * animation on a long line reads as a novelty typewriter, and it wrecks text
 * selection and screen-reader output.
 *
 * Accessibility: the full string is exposed once via aria-label and the
 * animated spans are hidden from assistive tech, so a screen reader reads one
 * sentence rather than a list of words. Under reduced motion nothing animates
 * and the text renders plainly.
 */

import { motion, useReducedMotion } from "motion/react";
import type { ElementType } from "react";

export default function AnimatedText({
  text,
  as: Tag = "h2",
  className = "",
  /** Words wrapped in [[double brackets]] get the gradient accent treatment. */
  delay = 0,
  stagger = 0.045,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const reduced = useReducedMotion();
  const tokens = text.split(" ");

  const render = (w: string, i: number) => {
    const accent = w.startsWith("[[") || w.endsWith("]]");
    const clean = w.replace(/\[\[|\]\]/g, "");
    return (
      <span className="word-wrap" key={`${w}-${i}`}>
        <motion.span
          className={accent ? "word accent" : "word"}
          initial={reduced ? false : { opacity: 0, y: "0.5em", filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "0px 0px -12% 0px" }}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 0.72, delay: delay + i * stagger, ease: [0.22, 1, 0.36, 1] }
          }
        >
          {clean}
        </motion.span>
      </span>
    );
  };

  const plain = text.replace(/\[\[|\]\]/g, "");

  return (
    <Tag className={className} aria-label={plain}>
      <span aria-hidden="true">
        {tokens.map((w, i) => (
          <span key={i}>
            {render(w, i)}
            {i < tokens.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </Tag>
  );
}
