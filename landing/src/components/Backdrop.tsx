"use client";

/**
 * The backdrop: the ClinicOS film, scrubbed by scroll.
 *
 * The film is 3.15 seconds of glass lenses turning in green light. It opens
 * near-black on a single rim, light sweeps across the glass, and it settles in a
 * mint-white bloom. The page plays it as you read: each section holds the film at
 * its own moment (`time` in scenes.ts), so the top of the page is the dark opening
 * and the last section is the bloom. It is the real footage, prepared by
 * scripts/backdrop.py, not an imitation of it.
 *
 * Keeping a scrubbed video smooth:
 *   - It is never played, only seeked. The encode has a keyframe every six frames,
 *     so a seek decodes at most five.
 *   - A new seek waits until the last one has landed. Queuing seeks during a fast
 *     scroll is what makes scrubbed video stutter; jumping to wherever the scroll
 *     has got to, once the decoder is free, keeps it fluid.
 *   - The position eases toward the scroll target instead of jumping to it, and
 *     drifts a few frames either way while the page is still, so the glass keeps
 *     turning slowly and the page never freezes.
 *
 * Keeping the copy readable: scripts/backdrop.py measured, for every frame and for
 * each of 24 horizontal bands of the screen, how far text in that band must be
 * darkened to hold 4.5:1 — over the copy column, across a centred section, and
 * under a glass panel. Here the page checks which bands have text, panels or the
 * header in them at this moment, and sets the two veils, --panel-a and --header-a
 * to what those bands need on the frame on screen. So the film is dimmed only
 * where something is being read over it: the light across the top of the opening
 * is left alone while the headline sits in the dark middle of the frame, and a
 * label scrolling in at the edge is still covered.
 *
 * The poster is the video's own first frame, so nothing shifts when the video takes
 * over from it. Frame 0's row of the table ships in the bundle, so the poster is
 * protected before the table file arrives, and under reduced motion or Save-Data,
 * when the video never loads at all. If the table cannot be fetched, the film is
 * never shown: a still backdrop is better than an unprotected moving one.
 *
 * Colour: the page's --scene-* variables cross-fade between sections in the same
 * loop. They are interpolated by hand, because interpolating a custom property's
 * colour is not something any animation library does reliably across browsers.
 */

import { useEffect, useRef, useState } from "react";
import { SCENES, SCENE_ANCHORS } from "./scenes";
import { FPS, FRAMES, POSTER, ROWS, SOURCES } from "./backdrop-frames";

type Shape = keyof typeof SOURCES;

const VARS = ["ground", "a", "b", "c", "accent"] as const;

/** The opening on a fresh load, in ms: the light crossing the glass while the headline assembles. */
const INTRO_MS = 2600;
/** How far the film drifts either way while the page is still (seconds of film), and the period of one drift. */
const DRIFT = 0.05;
const DRIFT_PERIOD_S = 9;
/**
 * Time constant for easing toward the scroll position, in seconds. Short enough
 * that the film feels attached to the scroll, long enough that one wheel notch
 * glides rather than steps.
 */
const EASE_S = 0.12;
const LAST = (FRAMES - 1) / FPS;

/** Columns of the readability table. */
const COPY = 0;
const EVEN = 1;
const PANEL = 2;
/** Below this a panel stops reading as glass. Matches PANEL_MIN in the script and --panel-a in globals.css. */
const PANEL_FLOOR = 0.34;
/** Re-check at least this often while nothing scrolls: reveal animations move text on their own. */
const REFRESH_MS = 250;

/** Text that sits straight on the film. Text inside a glass panel is covered by the panel's tint instead. */
const TEXT = "h1, section h2, .eyebrow, .lede, .contact-note, .tour-cap, .tour-note";
const PANELS = ".glass, .btn-ghost";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const toRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const PALETTE = SCENES.map((s) => VARS.map((k) => toRgb(s[k])));

/** A fractional scene position, as the pair of scenes it sits between. */
function between(s: number): [number, number] {
  const i = clamp(Math.floor(s), 0, SCENES.length - 2);
  return [i, clamp(s - i, 0, 1)];
}

function timeAt(s: number) {
  const [i, f] = between(s);
  return SCENES[i].time + (SCENES[i + 1].time - SCENES[i].time) * f;
}

/** 0 where a section wants the copy-column veil, 1 where it wants the even one. */
function evennessAt(s: number) {
  const [i, f] = between(s);
  const e = (k: number) => (SCENES[k].veil === "even" ? 1 : 0);
  return e(i) + (e(i + 1) - e(i)) * f;
}

function paint(s: number) {
  const [i, f] = between(s);
  const style = document.documentElement.style;
  VARS.forEach((k, j) => {
    const from = PALETTE[i][j];
    const to = PALETTE[i + 1][j];
    const c = from.map((v, n) => Math.round(v + (to[n] - v) * f));
    style.setProperty(`--scene-${k}`, `rgb(${c[0]} ${c[1]} ${c[2]})`);
  });
}

/**
 * The scroll position at which each section's scene is fully in effect: when the
 * section's top reaches the middle of the viewport. Null on pages without those
 * sections (privacy, not found), which hold the first scene.
 */
function measureAnchors(): number[] | null {
  const out: number[] = [];
  for (const id of SCENE_ANCHORS) {
    const el = document.getElementById(id);
    if (!el) return null;
    const at = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.5;
    out.push(out.length === 0 ? 0 : Math.max(out[out.length - 1] + 1, at));
  }
  return out;
}

function sceneAt(y: number, anchors: number[] | null) {
  if (!anchors || y <= 0) return 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (y < anchors[i + 1]) return i + (y - anchors[i]) / (anchors[i + 1] - anchors[i]);
  }
  return anchors.length - 1;
}

/** Frame 0 of a table, from the copy that ships in the bundle. */
function posterTable(shape: Shape) {
  const t = new Uint8Array(ROWS * 3);
  POSTER[shape].forEach((column, c) => column.forEach((v, r) => (t[r * 3 + c] = v)));
  return t;
}

export default function Backdrop() {
  const film = useRef<HTMLVideoElement>(null);
  const veilCopy = useRef<HTMLDivElement>(null);
  const veilEven = useRef<HTMLDivElement>(null);
  // null until the client has checked. The server renders the poster either way.
  const [still, setStill] = useState<boolean | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const update = () => setStill(reduce.matches || !!connection?.saveData);
    update();
    reduce.addEventListener("change", update);
    return () => reduce.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (still === null) return;
    const v = film.current;
    const copy = veilCopy.current;
    const even = veilEven.current;
    if (!v || !copy || !even) return;

    const root = document.documentElement.style;
    const portrait = window.matchMedia("(orientation: portrait)");
    const narrow = window.matchMedia("(max-width: 979px)");
    const shape = (): Shape => (portrait.matches ? "portrait" : "landscape");

    const texts = Array.from(document.querySelectorAll(TEXT)).filter((el) => !el.closest(".glass"));
    const panels = Array.from(document.querySelectorAll(PANELS));
    const header = document.querySelector(".site-header");

    let poster = posterTable(shape());
    let table: Uint8Array | null = null;
    const textRows = new Uint8Array(ROWS);
    const panelRows = new Uint8Array(ROWS);
    const headerRows = new Uint8Array(ROWS);

    // Written only when they change: every write to :root restyles the page.
    let lastCopy = "";
    let lastEven = "";
    let lastPanel = "";
    let lastHeader = "";

    /** Set the veils for frames lo..hi, or for the poster while that is what is on screen. */
    const shield = (lo: number, hi: number, s: number, onPoster: boolean) => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const src = SOURCES[shape()];
      // Where the film's bands land on screen: object-fit: cover can crop it top and bottom.
      const dh = src.height * Math.max(W / src.width, H / src.height);
      const dy = (H - dh) / 2;
      const mark = (el: Element, rows: Uint8Array) => {
        const r = el.getBoundingClientRect();
        const top = Math.max(0, r.top);
        const bottom = Math.min(H, r.bottom);
        if (bottom <= top) return;
        const r0 = clamp(Math.floor(((top - dy) / dh) * ROWS), 0, ROWS - 1);
        const r1 = clamp(Math.floor(((bottom - dy) / dh) * ROWS), 0, ROWS - 1);
        for (let i = r0; i <= r1; i++) rows[i] = 1;
      };
      textRows.fill(0);
      panelRows.fill(0);
      headerRows.fill(0);
      for (const el of texts) mark(el, textRows);
      for (const el of panels) mark(el, panelRows);
      if (header) mark(header, headerRows);

      const data = onPoster || !table ? poster : table;
      const f0 = data === poster ? 0 : lo;
      const f1 = data === poster ? 0 : hi;
      const need = (column: number, rows: Uint8Array) => {
        let m = 0;
        for (let f = f0; f <= f1; f++) {
          for (let r = 0; r < ROWS; r++) {
            if (rows[r]) m = Math.max(m, data[(f * ROWS + r) * 3 + column]);
          }
        }
        return m / 255;
      };

      const evenness = portrait.matches || narrow.matches ? 1 : evennessAt(s);
      const needEven = need(EVEN, textRows);
      const evenA = needEven * evenness;
      const needCopy =
        evenness === 1 ? 0
        : evenness === 0 ? need(COPY, textRows)
        : Math.max(need(COPY, textRows), needEven);
      // The two veils stack. Size the copy-column one so that together they give
      // the column exactly what it needs, mid-transition included.
      const copyA = needCopy <= evenA ? 0 : 1 - (1 - needCopy) / (1 - evenA);

      const c = copyA.toFixed(3);
      const e = evenA.toFixed(3);
      const p = Math.max(PANEL_FLOOR, need(PANEL, panelRows)).toFixed(2);
      const h = need(EVEN, headerRows).toFixed(2);
      if (c !== lastCopy) copy.style.opacity = lastCopy = c;
      if (e !== lastEven) even.style.opacity = lastEven = e;
      if (p !== lastPanel) root.setProperty("--panel-a", (lastPanel = p));
      if (h !== lastHeader) root.setProperty("--header-a", (lastHeader = h));
    };

    if (still) {
      paint(0);
      const update = () => shield(0, 0, 0, true);
      const reshape = () => {
        poster = posterTable(shape());
        update();
      };
      update();
      window.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
      portrait.addEventListener("change", reshape);
      return () => {
        window.removeEventListener("scroll", update);
        window.removeEventListener("resize", update);
        portrait.removeEventListener("change", reshape);
      };
    }

    let anchors = measureAnchors();
    let hasData = false;  // the current source can be seeked
    let revealed = false; // the video has faded in over the poster
    let asked = -1;       // frame last requested
    let onScreen = -1;    // frame last presented
    let loadId = 0;
    let raf = 0;
    let last = performance.now();
    let lastScene = -1;
    let shieldKey = "";
    let shieldAt = 0;
    // Only a fresh load at the top of the page gets the opening. A reload halfway
    // down starts where the reader already is.
    let introStart: number | null = window.scrollY < 4 ? last : null;
    let driftStart = last;
    let cur = introStart === null ? timeAt(sceneAt(window.scrollY, anchors)) : 0;

    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.disablePictureInPicture = true;
    (v as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;

    const load = () => {
      const id = ++loadId;
      const sh = shape();
      hasData = revealed = false;
      asked = onScreen = -1;
      table = null;
      poster = posterTable(sh);
      shieldKey = "";
      v.classList.remove("is-ready");
      fetch(SOURCES[sh].table)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`table ${r.status}`))))
        .then((buf) => {
          if (id === loadId && buf.byteLength === FRAMES * ROWS * 3) table = new Uint8Array(buf);
        })
        .catch(() => {
          // No table, no film. The poster stays, protected by frame 0's row.
        });
      v.preload = "auto";
      v.src = SOURCES[sh].video;
      v.load();
    };
    const onMeta = () => {
      // iOS Safari will not buffer a video that has never played, whatever
      // `preload` says. A muted play-and-pause is allowed and unlocks it. Elsewhere
      // it is harmless: forgetting the last request forces a fresh seek.
      v.play().then(
        () => {
          v.pause();
          asked = -1;
        },
        () => {},
      );
    };
    const onData = () => {
      hasData = true;
    };
    const onSeeked = () => {
      onScreen = asked;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const s = sceneAt(window.scrollY, anchors);
      if (Math.abs(s - lastScene) > 0.0005) {
        paint(s);
        lastScene = s;
      }

      let target = timeAt(s);
      if (introStart !== null) {
        const p = Math.min(1, (now - introStart) / INTRO_MS);
        target *= 1 - Math.pow(1 - p, 3);
        if (p === 1) {
          introStart = null;
          driftStart = now;
        }
      } else {
        target += DRIFT * Math.sin(((now - driftStart) / 1000 / DRIFT_PERIOD_S) * Math.PI * 2);
      }
      cur += (clamp(target, 0, LAST) - cur) * (1 - Math.exp(-dt / EASE_S));
      const frame = clamp(Math.round(cur * FPS), 0, FRAMES - 1);

      if (hasData && frame !== asked && !v.seeking) {
        asked = frame;
        // The middle of the frame, so rounding in the decoder never lands on its neighbour.
        v.currentTime = (frame + 0.5) / FPS;
      }

      // Show the film once a seek has landed where it was asked to, and the table
      // that protects the copy over it has arrived.
      if (!revealed && hasData && table && onScreen >= 0 && onScreen === asked && !v.seeking) {
        revealed = true;
        v.classList.add("is-ready");
      }

      let lo = frame;
      let hi = frame;
      if (asked >= 0) {
        lo = Math.min(lo, asked);
        hi = Math.max(hi, asked);
      }
      if (onScreen >= 0) {
        lo = Math.min(lo, onScreen);
        hi = Math.max(hi, onScreen);
      }
      const key = `${Math.round(window.scrollY)}|${lo}|${hi}|${revealed}|${lastScene}`;
      if (key !== shieldKey || now - shieldAt > REFRESH_MS) {
        shieldKey = key;
        shieldAt = now;
        shield(lo, hi, s, !revealed);
      }
    };

    const remeasure = () => {
      anchors = measureAnchors();
      shieldKey = "";
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.body);
    window.addEventListener("resize", remeasure);
    window.addEventListener("load", remeasure);
    portrait.addEventListener("change", load);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("loadeddata", onData);
    v.addEventListener("seeked", onSeeked);
    load();
    raf = requestAnimationFrame(tick);

    return () => {
      loadId++;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("load", remeasure);
      portrait.removeEventListener("change", load);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("loadeddata", onData);
      v.removeEventListener("seeked", onSeeked);
      v.classList.remove("is-ready");
      v.removeAttribute("src");
      v.load();
    };
  }, [still]);

  return (
    <div className="backdrop" aria-hidden="true">
      <picture className="backdrop-still">
        <source media="(orientation: portrait)" srcSet={SOURCES.portrait.poster} />
        <img src={SOURCES.landscape.poster} alt="" decoding="async" fetchPriority="high" />
      </picture>
      <video ref={film} className="backdrop-film" muted playsInline preload="none" tabIndex={-1} />
      <div ref={veilCopy} className="backdrop-veil backdrop-veil-copy" />
      <div ref={veilEven} className="backdrop-veil" />
      <div className="backdrop-grain" />
    </div>
  );
}
