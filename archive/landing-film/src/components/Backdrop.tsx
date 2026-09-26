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
 * Why frames on a canvas and not a <video>: the first version seeked a video, and
 * scrubbing looked like ten frames a second. A seek is asynchronous and takes a
 * decoder tens of milliseconds, and the page could only ever show one of the
 * film's 190 frames, each spread across fifty-odd pixels of scroll. Now:
 *
 *   - The film is AI-upscaled and interpolated to several hundred frames
 *     (scripts/backdrop.py), placed where the film actually moves.
 *   - They arrive as small AVIF images in five packs: every sixteenth frame and the
 *     opening first, then each pack doubles the density. The film is usable within
 *     the first few hundred kilobytes and sharpens as the rest lands.
 *   - Frames are decoded off the main thread into a small cache around the frame on
 *     screen, leaning in the direction of travel, and dropped as they fall behind.
 *   - Every screen refresh draws the exact moment the scroll is at by blending the
 *     two frames either side of it, so motion never steps, whatever the refresh rate.
 *
 * Keeping the copy readable: scripts/backdrop.py measured, for every frame and for
 * each of 24 horizontal bands of the screen, how far text in that band must be
 * darkened to hold 4.5:1 — over the copy column, across a centred section, and
 * under a glass panel. The page checks which bands have text, panels or the header
 * in them at this moment, and sets the two veils, --panel-a and --header-a to what
 * those bands need on the frames being shown.
 *
 * The poster is the film's first frame, and frame 0's row of the readability table
 * ships in the bundle. So the poster is protected before anything else arrives, and
 * under reduced motion or Save-Data, when the frames never load at all. If the
 * frames or the table cannot be fetched or decoded, the poster stays: a still
 * backdrop is better than an unprotected moving one.
 *
 * Colour: the page's --scene-* variables cross-fade between sections in the same
 * loop. They are interpolated by hand, because interpolating a custom property's
 * colour is not something any animation library does reliably across browsers.
 */

import { useEffect, useRef, useState } from "react";
import { SCENES, SCENE_ANCHORS } from "./scenes";
import { FRAMES, LEVELS, POSTER, ROWS, SHAPES, TICKS, TICKS_PER_SECOND, packUrl } from "./backdrop-frames";

type Shape = keyof typeof SHAPES;
type Tier = keyof (typeof SHAPES)["landscape"]["tiers"];

const VARS = ["ground", "a", "b", "c", "accent"] as const;

/** The opening on a fresh load, in ms: the light crossing the glass while the headline assembles. */
const INTRO_MS = 2600;
/** How far the film drifts either way while the page is still (seconds of film), and the period of one drift. */
const DRIFT = 0.05;
const DRIFT_PERIOD_S = 9;
/**
 * Time constant for easing toward the scroll position, in seconds. Lenis already
 * smooths the scroll itself, so this only takes the edge off a trackpad's jitter.
 */
const EASE_S = 0.06;
/**
 * While only the drift is moving, redraw at most this often. The drift is slow
 * enough that 30 updates a second look continuous, and it stops a 240 Hz screen
 * redrawing the film, and re-blurring every glass panel over it, 240 times a second.
 */
const IDLE_FRAME_MS = 33;
/** Scrolling within this long ago counts as moving: draw on every refresh. */
const SCROLL_SETTLE_MS = 200;
/** How far to look for a decoded frame either side of the moment on screen. */
const SEARCH = 48;

/** Pack header: "CSQ1", then a frame count, then (frame, offset, length) per frame. */
const MAGIC = 0x31515343;

const TIMES = TICKS.map((t) => t / TICKS_PER_SECOND);
const LAST = TIMES[FRAMES - 1];

/** Columns of the readability table. */
const COPY = 0;
const EVEN = 1;
const PANEL = 2;
/** Below this a panel stops reading as glass. Matches PANEL_MIN in the script and --panel-a in globals.css. */
const PANEL_FLOOR = 0.34;
/** Re-check at least this often while nothing scrolls: reveal animations move text on their own. */
const REFRESH_MS = 500;

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

/** The fractional frame for a moment of the film. Frames are not evenly spaced in time. */
function frameAt(t: number) {
  if (t <= 0) return 0;
  if (t >= LAST) return FRAMES - 1;
  let lo = 0;
  let hi = FRAMES - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (TIMES[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - TIMES[lo]) / (TIMES[hi] - TIMES[lo]);
}

/** Frame 0 of a table, from the copy that ships in the bundle. */
function posterTable(shape: Shape) {
  const t = new Uint8Array(ROWS * 3);
  POSTER[shape].forEach((column, c) => column.forEach((v, r) => (t[r * 3 + c] = v)));
  return t;
}

/** Reads one pack into per-frame Blobs. Slicing a Blob copies nothing. */
async function loadPack(url: string, into: (Blob | undefined)[], signal: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const pack = await res.blob();
  const head = new DataView(await pack.slice(0, 8).arrayBuffer());
  if (head.getUint32(0, true) !== MAGIC) throw new Error(`${url}: not a frame pack`);
  const count = head.getUint32(4, true);
  const index = new DataView(await pack.slice(8, 8 + count * 12).arrayBuffer());
  for (let k = 0; k < count; k++) {
    const frame = index.getUint32(k * 12, true);
    const offset = index.getUint32(k * 12 + 4, true);
    const length = index.getUint32(k * 12 + 8, true);
    if (frame < FRAMES) into[frame] = pack.slice(offset, offset + length, "image/avif");
  }
}

export default function Backdrop() {
  const film = useRef<HTMLCanvasElement>(null);
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
    const canvas = film.current;
    const copy = veilCopy.current;
    const even = veilEven.current;
    if (!canvas || !copy || !even) return;

    const root = document.documentElement.style;
    const portrait = window.matchMedia("(orientation: portrait)");
    const narrow = window.matchMedia("(max-width: 979px)");
    const shapeNow = (): Shape => (portrait.matches ? "portrait" : "landscape");

    const texts = Array.from(document.querySelectorAll(TEXT)).filter((el) => !el.closest(".glass"));
    const panels = Array.from(document.querySelectorAll(PANELS));
    const header = document.querySelector(".site-header");

    let shape = shapeNow();
    let poster = posterTable(shape);
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
      const src = SHAPES[shape].tiers.hd;
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
      const f0 = data === poster ? 0 : clamp(lo, 0, FRAMES - 1);
      const f1 = data === poster ? 0 : clamp(hi, 0, FRAMES - 1);
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
        shape = shapeNow();
        poster = posterTable(shape);
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

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx || typeof createImageBitmap !== "function") {
      // Nothing to draw with. The poster stays, protected by frame 0's row.
      paint(0);
      shield(0, 0, 0, true);
      return;
    }

    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency || 4;
    /**
     * Canvas pixels per CSS pixel. The device pixel ratio, but never more than about
     * three million pixels in all. Measured on a laptop's integrated graphics, a
     * 1440x900 window at 2x (a 5.2 MP canvas, filled twice per refresh for the blend,
     * with glass panels re-blurring over it) ran at 42 frames a second. The film is
     * soft glass, so the extra pixels bought nothing visible.
     */
    const scaleFor = () =>
      Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3_000_000 / (window.innerWidth * window.innerHeight)));
    /**
     * The frame size to fetch. The 1440p set only where the capped canvas is wider than
     * 2400 px and the device has the memory: its frames took twice as long to decode
     * (51 ms against 22 ms), and below that width the 1080p set fills the canvas as
     * well as the larger one would.
     */
    const tierFor = (): Tier =>
      Math.max(window.innerWidth, window.innerHeight) * scaleFor() > 2400 && memory >= 4 ? "uhd" : "hd";
    // Decodes run off the main thread, one per core; leave half the cores for the page.
    const maxInflight = clamp(cores >> 1, 2, 6);

    let tier = tierFor();
    let capacity = 12;
    let blobs: (Blob | undefined)[] = [];
    const bitmaps = new Map<number, ImageBitmap>();
    const inflight = new Set<number>();
    let abort = new AbortController();
    let loadId = 0;
    let failures = 0;
    let failed = false;
    let drawn = false;    // at least one frame of the current set is on the canvas
    let revealed = false; // the canvas has faded in over the poster

    let anchors = measureAnchors();
    let raf = 0;
    let last = performance.now();
    let lastScene = -1;
    let lastY = window.scrollY;
    let lastScrollAt = -Infinity;
    let shieldKey = "";
    let shieldAt = 0;
    let drawKey = "";
    let drawAt = 0;
    let shownA = 0;
    let shownB = -1;
    let direction = 1;
    // Only a fresh load at the top of the page gets the opening. A reload halfway
    // down starts where the reader already is.
    let introStart: number | null = window.scrollY < 4 ? last : null;
    let driftStart = last;
    let cur = introStart === null ? timeAt(sceneAt(window.scrollY, anchors)) : 0;
    let pos = frameAt(cur);

    const size = () => {
      const scale = scaleFor();
      const w = Math.max(1, Math.round(window.innerWidth * scale));
      const h = Math.max(1, Math.round(window.innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        drawKey = "";
      }
    };

    const load = () => {
      abort.abort();
      abort = new AbortController();
      const id = ++loadId;
      const signal = abort.signal;
      shape = shapeNow();
      tier = tierFor();
      capacity = memory < 4 ? 8 : tier === "uhd" ? 12 : 16;
      for (const bmp of bitmaps.values()) bmp.close();
      bitmaps.clear();
      inflight.clear();
      blobs = new Array(FRAMES);
      table = null;
      poster = posterTable(shape);
      failures = 0;
      failed = drawn = revealed = false;
      shieldKey = drawKey = "";
      canvas.classList.remove("is-ready");

      fetch(SHAPES[shape].table, { signal })
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`table ${r.status}`))))
        .then((buf) => {
          if (id === loadId && buf.byteLength === FRAMES * ROWS * 3) table = new Uint8Array(buf);
        })
        .catch(() => {
          // No table, no film. The poster stays, protected by frame 0's row.
        });

      void (async () => {
        for (let level = 0; level < LEVELS; level++) {
          try {
            await loadPack(packUrl(shape, tier, level), blobs, signal);
          } catch {
            // A missing first pack means no film at all. A later one just means
            // fewer frames: the ones already here still blend smoothly.
            if (id === loadId && level === 0) failed = true;
            return;
          }
          if (id !== loadId) return;
        }
      })();
    };

    const evict = () => {
      while (bitmaps.size > capacity) {
        let far = -1;
        let dist = -1;
        for (const k of bitmaps.keys()) {
          const d = Math.abs(k - pos);
          if (d > dist) {
            dist = d;
            far = k;
          }
        }
        bitmaps.get(far)?.close();
        bitmaps.delete(far);
      }
    };

    const decode = (f: number) => {
      const blob = blobs[f];
      if (!blob) return;
      const id = loadId;
      inflight.add(f);
      createImageBitmap(blob).then(
        (bmp) => {
          inflight.delete(f);
          if (id !== loadId) {
            bmp.close();
            return;
          }
          bitmaps.set(f, bmp);
          evict();
          drawKey = "";
        },
        () => {
          inflight.delete(f);
          // A browser that cannot decode AVIF fails every frame. Give up after a few,
          // and only if none has ever worked.
          if (id === loadId && ++failures >= 3 && bitmaps.size === 0) failed = true;
        },
      );
    };

    /** Decode nearest-first around the frame on screen, leaning in the direction of travel. */
    const schedule = () => {
      if (inflight.size >= maxInflight) return;
      const i = Math.floor(pos);
      const wanted = (f: number) => f >= 0 && f < FRAMES && blobs[f] && !bitmaps.has(f) && !inflight.has(f);
      const tryFrame = (f: number) => {
        if (inflight.size < maxInflight && wanted(f)) decode(f);
      };
      tryFrame(i);
      tryFrame(i + 1);
      const reach = capacity - 2;
      for (let k = 1; k <= reach && inflight.size < maxInflight; k++) {
        tryFrame(direction >= 0 ? i + 1 + k : i - k);
        if (k % 3 === 0) tryFrame(direction >= 0 ? i - k / 3 : i + 1 + k / 3);
      }
    };

    const cover = (bmp: ImageBitmap, alpha: number) => {
      const W = canvas.width;
      const H = canvas.height;
      const s = Math.max(W / bmp.width, H / bmp.height);
      const sw = W / s;
      const sh = H / s;
      ctx.globalAlpha = alpha;
      ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, W, H);
    };

    /** Draw the moment `t` as a blend of the nearest decoded frames either side of it. */
    const draw = (t: number, now: number, busy: boolean) => {
      if (bitmaps.size === 0) return;
      const i = clamp(Math.floor(pos), 0, FRAMES - 1);
      let a = -1;
      let b = -1;
      for (let k = i; k >= Math.max(0, i - SEARCH); k--) {
        if (bitmaps.has(k)) {
          a = k;
          break;
        }
      }
      for (let k = i + 1; k <= Math.min(FRAMES - 1, i + 1 + SEARCH); k++) {
        if (bitmaps.has(k)) {
          b = k;
          break;
        }
      }
      if (a < 0 && b < 0) {
        // Nothing decoded near here yet: hold the nearest frame there is.
        let best = Infinity;
        for (const k of bitmaps.keys()) {
          if (Math.abs(k - pos) < best) {
            best = Math.abs(k - pos);
            a = k;
          }
        }
      } else if (a < 0) {
        a = b;
        b = -1;
      }
      const alpha = b >= 0 ? clamp((t - TIMES[a]) / (TIMES[b] - TIMES[a]), 0, 1) : 0;
      const key = `${a}|${b}|${Math.round(alpha * 1024)}|${canvas.width}x${canvas.height}`;
      if (key === drawKey) return;
      if (!busy && drawKey !== "" && now - drawAt < IDLE_FRAME_MS) return;

      const bmpA = bitmaps.get(a);
      const bmpB = b >= 0 ? bitmaps.get(b) : undefined;
      if (!bmpA) return;
      if (bmpB && alpha >= 0.999) {
        cover(bmpB, 1);
      } else {
        cover(bmpA, 1);
        if (bmpB && alpha > 0.001) cover(bmpB, alpha);
      }
      drawKey = key;
      drawAt = now;
      drawn = true;
      shownA = a;
      shownB = bmpB && alpha > 0.001 ? b : -1;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const y = window.scrollY;
      if (y !== lastY) {
        lastY = y;
        lastScrollAt = now;
      }
      const s = sceneAt(y, anchors);
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
      const prev = cur;
      cur += (clamp(target, 0, LAST) - cur) * (1 - Math.exp(-dt / EASE_S));
      if (cur !== prev) direction = cur > prev ? 1 : -1;
      pos = frameAt(cur);

      if (!failed) {
        schedule();
        draw(cur, now, introStart !== null || now - lastScrollAt < SCROLL_SETTLE_MS);
      }

      // Fade the film in once a frame of it is on the canvas and the table that
      // protects the copy over it has arrived, in whichever order they land.
      if (!revealed && drawn && table && !failed) {
        revealed = true;
        canvas.classList.add("is-ready");
      }

      const i = Math.floor(pos);
      let lo = Math.min(i, shownA);
      let hi = Math.max(Math.min(i + 1, FRAMES - 1), shownA);
      if (shownB >= 0) {
        lo = Math.min(lo, shownB);
        hi = Math.max(hi, shownB);
      }
      const key = `${Math.round(y / 20)}|${lo}|${hi}|${revealed}|${lastScene}`;
      if (key !== shieldKey || now - shieldAt > REFRESH_MS) {
        shieldKey = key;
        shieldAt = now;
        shield(lo, hi, s, !revealed);
      }
    };

    const remeasure = () => {
      anchors = measureAnchors();
      size();
      shieldKey = "";
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.body);
    window.addEventListener("resize", remeasure);
    window.addEventListener("load", remeasure);
    portrait.addEventListener("change", load);
    size();
    load();
    raf = requestAnimationFrame(tick);

    return () => {
      loadId++;
      abort.abort();
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("load", remeasure);
      portrait.removeEventListener("change", load);
      for (const bmp of bitmaps.values()) bmp.close();
      bitmaps.clear();
      canvas.classList.remove("is-ready");
    };
  }, [still]);

  return (
    <div className="backdrop" aria-hidden="true">
      <picture className="backdrop-still">
        <source media="(orientation: portrait)" type="image/avif" srcSet={SHAPES.portrait.poster.avif} />
        <source media="(orientation: portrait)" type="image/webp" srcSet={SHAPES.portrait.poster.webp} />
        <source type="image/avif" srcSet={SHAPES.landscape.poster.avif} />
        <img src={SHAPES.landscape.poster.webp} alt="" decoding="async" fetchPriority="high" />
      </picture>
      <canvas ref={film} className="backdrop-film" />
      <div ref={veilCopy} className="backdrop-veil backdrop-veil-copy" />
      <div ref={veilEven} className="backdrop-veil" />
      <div className="backdrop-grain" />
    </div>
  );
}
