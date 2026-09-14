/**
 * Scenes, one per section: the page's colour, the moment of the film behind it,
 * and how the copy is shielded from that film.
 *
 * As you scroll, the backdrop film (Backdrop.tsx) is scrubbed forward: each
 * section holds it at its own `time`, so the top of the page is the film's dark
 * opening and "Get in touch" is the mint bloom it ends on. The page's colours
 * cross-fade between sections at the same rate. Nothing on the page hard-codes a
 * colour that takes part in this — everything reads the --scene-* variables — so
 * adding a section means adding a scene here, and its id to SCENE_ANCHORS, and
 * nothing else.
 *
 * The palette is taken from the film itself: near-black with a green cast, deep
 * teal, sea-glass, and a mint-white glow.
 */

export type Scene = {
  /** page ground */
  ground: string;
  /** primary light: mid teal */
  a: string;
  /** secondary light: the bright sea-glass one */
  b: string;
  /** deep fill */
  c: string;
  /** text accent + eyebrow */
  accent: string;
  /** seconds into the film that this section holds at (the film runs 0–3.15) */
  time: number;
  /**
   * "copy": the veil sits over the copy column on the left and the film shows at
   * full strength on the right. "even": one even veil, for centred sections.
   * Below 980px, and on tall screens, the veil is always even.
   */
  veil: "copy" | "even";
};

export const SCENES: Scene[] = [
  // hero — the opening: black, one rim, the first light arriving
  { ground: "#010504", a: "#1f7a6e", b: "#a8dcc9", c: "#0a3a33", accent: "#8fe6c8", time: 0.26, veil: "copy" },
  // the problem — the light sweeps across the glass
  { ground: "#010606", a: "#1b616b", b: "#8fc9c6", c: "#062f38", accent: "#93dbd6", time: 0.52, veil: "copy" },
  // how it works — deep teal, the rims doubling
  { ground: "#020805", a: "#2c7d62", b: "#b5e3c8", c: "#0b3a28", accent: "#9ee8c3", time: 0.78, veil: "copy" },
  // where the data lives — the light breaking through
  { ground: "#01070a", a: "#13596b", b: "#7fc3cf", c: "#05303e", accent: "#8fd3de", time: 1.05, veil: "copy" },
  // what is built — the lens comes into view
  { ground: "#020706", a: "#377e7d", b: "#aacfc8", c: "#0e414c", accent: "#a4ddd3", time: 1.4, veil: "copy" },
  // the product tour — centred screens, so an even veil
  { ground: "#010303", a: "#16504f", b: "#6fa9a0", c: "#042420", accent: "#8ccfc2", time: 1.8, veil: "even" },
  // who it is for — the lens turning in the glow
  { ground: "#030806", a: "#3f8f78", b: "#d2ede3", c: "#10453a", accent: "#b3eed8", time: 2.25, veil: "copy" },
  // where this is — a centred panel
  { ground: "#010504", a: "#245f55", b: "#9cc9bf", c: "#0a332c", accent: "#9fdcc9", time: 2.7, veil: "even" },
  // get in touch — the page ends in the mint bloom the film ends on
  { ground: "#020806", a: "#2a8f7a", b: "#e0f0ec", c: "#0c3f36", accent: "#a6f0d6", time: 3.08, veil: "copy" },
];

/** DOM ids of the sections each scene belongs to, in document order. */
export const SCENE_ANCHORS = ["hero", "problem", "how", "privacy", "built", "tour", "scale", "status", "contact"];
