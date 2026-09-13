/**
 * Colour scenes, one per section.
 *
 * The whole page re-lights as you scroll: ground, the three light colours, and
 * the accent all cross-fade between these. Nothing on the page hard-codes a
 * colour that participates in this — everything reads the CSS variables that
 * Stage.tsx interpolates, so adding a section means adding a scene here and
 * nothing else.
 *
 * The palette stays inside a blue → teal → indigo family. It shifts enough to
 * be unmistakable in motion without ever leaving something that could plausibly
 * be one product's brand.
 */

export type Scene = {
  /** page ground */
  ground: string;
  /** primary light */
  a: string;
  /** secondary light — the bright one */
  b: string;
  /** deep fill */
  c: string;
  /** text accent + eyebrow */
  accent: string;
};

export const SCENES: Scene[] = [
  // hero — electric blue / cyan
  { ground: "#03060a", a: "#2f6df6", b: "#22d3ee", c: "#0f2f8f", accent: "#67e8f9" },
  // the problem — colder, indigo
  { ground: "#04050e", a: "#4f5bf0", b: "#7c8cff", c: "#221a8c", accent: "#9fb0ff" },
  // how it works — teal, the product's own colour
  { ground: "#02090b", a: "#12a89c", b: "#5eeadc", c: "#0a5b52", accent: "#5eccc2" },
  // where the data lives — deep ocean, the most "secure" of the set
  { ground: "#020a12", a: "#1668c4", b: "#4fd1f5", c: "#07386b", accent: "#7dd8f7" },
  // what is built — cooler, engineered
  { ground: "#020810", a: "#1a7fb8", b: "#5ad9e8", c: "#0a4466", accent: "#8ae4f2" },
  // the product tour — the darkest scene, so the screens carry the light
  { ground: "#01040a", a: "#2450c8", b: "#3fb8f0", c: "#081f4d", accent: "#7cc6f7" },
  // who it is for — widest, most open
  { ground: "#050416", a: "#7b5cf0", b: "#b79cff", c: "#3c1f9c", accent: "#c4b1ff" },
  // where this is — settles back toward the hero
  { ground: "#02060b", a: "#2f6df6", b: "#54e6c8", c: "#0d3170", accent: "#7cffcf" },
  // get in touch — the invitation, so the page ends on its brightest teal
  { ground: "#02080d", a: "#1f7ae0", b: "#5ef0d8", c: "#0b3d66", accent: "#8ff5e2" },
];

/** DOM ids of the sections each scene belongs to, in document order. */
export const SCENE_ANCHORS = ["hero", "problem", "how", "privacy", "built", "tour", "scale", "status", "contact"];
