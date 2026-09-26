"""
Builds the landing site's backdrop from the source film.

    pip install imageio-ffmpeg numpy pillow
    python landing/scripts/backdrop.py --esrgan PATH --rife PATH [--work PATH] [--gpu N]

    --esrgan  folder holding realesrgan-ncnn-vulkan.exe and its models
              (github.com/xinntao/Real-ESRGAN, release v0.2.5.0)
    --rife    folder holding rife-ncnn-vulkan.exe and its models
              (github.com/nihui/rife-ncnn-vulkan, release 20221029)
    --work    folder for intermediate frames, several GB (default: a temp folder).
              Finished stages are reused on a re-run; pass --fresh to redo them.
    --gpu     Vulkan device for both tools (default: the first NVIDIA or AMD GPU found)

Input:   landing/media/backdrop-source.mp4          720x1280 portrait, 60 fps, 3.17 s
Output:  landing/public/backdrop/v2/                frame packs, posters, readability tables
         landing/media/og-backdrop.jpg              still for the share preview
         landing/src/components/backdrop-frames.ts  (generated, do not hand-edit)

Why each step is here:

- Upscale with Real-ESRGAN's video model, realesr-animevideov3, at 4x, then scale
  down to 1440x2560. It was compared with plain Lanczos and with the general
  realesrgan-x4plus model on a dark, a fast and a bright frame. It sharpens the
  glass rims and removes the source's compression blocking without moving the
  colours, where x4plus brightened the whites. It is also built for video, so detail
  does not shimmer from frame to frame. Rendering at 4x and scaling down keeps edges
  clean.
- Interpolate with RIFE v4.6 to eight frames per source frame. The first version
  scrubbed the 190 source frames and looked like ten frames a second: one frame
  covered fifty pixels of scroll. On the fastest pair of frames, ffmpeg's
  motion-compensated interpolation warped the thick rim and RIFE did not.
- Keep only the frames that differ visibly from the last one kept, and never more
  than 1/30 s of film apart. The film's motion is almost all in its first 1.2 s; its
  last second barely changes, and eight frames a source frame there is weight with
  nothing to show.
- AVIF stills rather than WebP or a video. A 1440p frame of this film is a fraction
  of the size as AVIF that it is as WebP, and a decoded still is on screen the moment
  it is drawn, where a video seek takes the decoder tens of milliseconds.
- Two sizes per orientation, 1080p and 1440p, landscape rotated a quarter-turn
  clockwise (a 16:9 crop threw away two thirds of the frame; clockwise keeps the
  copy side darkest through the opening). The page picks by screen pixels and memory.
- Five packs per set. The first holds every sixteenth frame plus the opening the page
  shows on load, and each after it doubles the density, so the film works early and
  sharpens as the rest arrives.
- The readability table. For every kept frame, and for each of 24 horizontal bands
  of the screen, it holds the least darkening that text in that band needs to reach
  4.5:1: over the copy column, across a centred section, and under a glass panel.
  The page darkens only the bands that have text in them. Per pixel, the least veil
  that makes that pixel dark enough; then the 99th percentile across the band. The
  target is 4.8:1 and values round up, for headroom over the browser's own scaling.

The colours below must match globals.css (--veil, --panel-rgb, --fg-dim, --fg-faint).
"""

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from multiprocessing import Pool

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
LANDING = os.path.dirname(HERE)
SRC = os.path.join(LANDING, "media", "backdrop-source.mp4")
OUT = os.path.join(LANDING, "public", "backdrop", "v2")
OG = os.path.join(LANDING, "media", "og-backdrop.jpg")
SCENES = os.path.join(LANDING, "src", "components", "scenes.ts")
MANIFEST = os.path.join(LANDING, "src", "components", "backdrop-frames.ts")
URL = "/backdrop/v2"
FF = imageio_ffmpeg.get_ffmpeg_exe()

SOURCE_FPS = 60
FACTOR = 8                         # interpolated frames per source frame
TICKS_PER_SECOND = SOURCE_FPS * FACTOR
MASTER = (1440, 2560)              # portrait; landscape is this rotated
SR_MODEL = "realesr-animevideov3-x4"
RIFE_MODEL = "rife-v4.6"
# UHD mode estimates motion at half resolution, which RIFE recommends above 2K. On
# the comparison pair at 720p it matched normal mode; the frames here are 1440x2560.
RIFE_UHD = True
KEEP_DIFF = 1.0                    # mean absolute change (0-255, at 180x320) that earns a new frame
MAX_GAP_TICKS = TICKS_PER_SECOND // 30
LEVELS = 5
# The opening shipped whole in the first pack. The page opens at 0.26 s of film
# (scenes.ts) and drifts 0.05 s either way, so 0.32 s covers every frame of the first
# view; 0.45 s put 30 more frames into the pack everyone downloads first.
HERO_SECONDS = 0.32
OG_SECONDS = 0.35

TIERS = {
    "portrait": {"hd": (1080, 1920), "uhd": (1440, 2560)},
    "landscape": {"hd": (1920, 1080), "uhd": (2560, 1440)},
}
# Chosen by a sweep over a dark, a fast and a bright frame at both sizes. At 45 the
# frames measured 44.5-46.3 dB PSNR against lossless, and at 2x zoom were
# indistinguishable from lossless and from 60 in the near-black gradients, where
# banding would show first. 60 cost about half as many bytes again for nothing visible.
AVIF_QUALITY = {"hd": 45, "uhd": 45}
AVIF_SPEED = 4

ROWS = 24
TARGET = 4.8
GROUND = np.array([1, 6, 4], float)    # --veil
PANEL = np.array([3, 11, 10], float)   # --panel-rgb
FG_DIM = "#b4c7c1"                     # --fg-dim: body copy on the film
FG_FAINT = "#93aaa3"                   # --fg-faint: small print inside panels
PANEL_MIN = 0.34                       # below this a panel stops reading as glass
BLUR_PX = 24                           # backdrop-filter: blur(24px) on .glass
ANALYSIS = {"portrait": (180, 320), "landscape": (320, 180)}
SPANS = {"portrait": {"copy": (0.06, 0.94), "even": (0.06, 0.94)},
         "landscape": {"copy": (0.05, 0.62), "even": (0.05, 0.95)}}


# ---------------------------------------------------------------------------- helpers

def rgb(hexstr):
    return np.array([int(hexstr[i:i + 2], 16) for i in (1, 3, 5)], float)


def luminance(c):
    c = np.asarray(c, float) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def pngs(folder):
    return sorted(os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(".png"))


def stage_done(folder, count):
    return os.path.isdir(folder) and len(pngs(folder)) >= count


def fresh_dir(folder):
    shutil.rmtree(folder, ignore_errors=True)
    os.makedirs(folder)


def detect_gpu(esrgan_exe, sample, scratch):
    """ncnn lists every Vulkan device when it starts. Prefer a discrete GPU."""
    out = subprocess.run([esrgan_exe, "-i", sample, "-o", os.path.join(scratch, "probe.png"),
                          "-n", SR_MODEL, "-s", "4", "-g", "0"],
                         capture_output=True, text=True, cwd=os.path.dirname(esrgan_exe))
    devices = re.findall(r"\[(\d+) ([^\]]+)\]", out.stdout + out.stderr)
    for index, name in devices:
        if re.search(r"NVIDIA|AMD|Radeon", name):
            return index, name
    return (devices[0] if devices else ("0", "default"))


def darkest_text_colour():
    """Text straight on the film is body copy or a scene's accent colour. Measure
    against whichever of those is darkest, so both are covered."""
    accents = re.findall(r'accent: "(#[0-9a-fA-F]{6})"', open(SCENES, encoding="utf-8").read())
    return min([FG_DIM, *accents], key=lambda c: float(luminance(rgb(c))))


def least_veil(frame, over, fg):
    """For each pixel, the least opacity of `over` that makes it dark enough for `fg`
    to reach TARGET against it. Browsers composite in sRGB, so this does too."""
    limit = (float(luminance(fg)) + 0.05) / TARGET - 0.05
    lo = np.zeros(frame.shape[:2])
    hi = np.ones(frame.shape[:2])
    for _ in range(14):
        mid = (lo + hi) / 2
        dark = luminance(frame * (1 - mid[..., None]) + over * mid[..., None]) <= limit
        hi = np.where(dark, mid, hi)
        lo = np.where(dark, lo, mid)
    return np.where(luminance(frame) <= limit, 0.0, hi)


def oriented(im, shape):
    return im.transpose(Image.Transpose.ROTATE_270) if shape == "landscape" else im


# ------------------------------------------------------------------ pool workers

def work_downscale(job):
    src, dst = job
    Image.open(src).convert("RGB").resize(MASTER, Image.LANCZOS, reducing_gap=3.0).save(dst, compress_level=1)
    return dst


def work_thumb(path):
    """A small greyscale copy of a master frame, for measuring motion."""
    return np.asarray(Image.open(path).convert("L").resize((180, 320), Image.BOX), dtype=np.float32)


def work_encode(job):
    index, src, avif_dir = job
    master = Image.open(src).convert("RGB")
    for shape, tiers in TIERS.items():
        im = oriented(master, shape)
        for tier, size in tiers.items():
            frame = im if im.size == size else im.resize(size, Image.LANCZOS, reducing_gap=3.0)
            buf = io.BytesIO()
            # One thread each: the pool already runs one encoder per core.
            frame.save(buf, "AVIF", quality=AVIF_QUALITY[tier], speed=AVIF_SPEED, max_threads=1)
            with open(os.path.join(avif_dir, f"{shape}-{tier}", f"{index:05d}.avif"), "wb") as fh:
                fh.write(buf.getvalue())
    return index


def work_table(job):
    src, text_fg = job
    master = Image.open(src).convert("RGB")
    rows = {}
    for shape in TIERS:
        w, h = ANALYSIS[shape]
        f = np.asarray(oriented(master, shape).resize((w, h), Image.BOX), dtype=np.float64)
        # The panels' blur in analysis pixels, as on a 1440 px wide screen. Phones
        # blur more per pixel of film than that, so this errs on the safe side.
        sigma = BLUR_PX * max(w, h) / 1440
        blurred = np.asarray(Image.fromarray(f.astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma)), dtype=np.float64)
        text = least_veil(f, GROUND, text_fg)
        panel = np.maximum(PANEL_MIN, least_veil(blurred, PANEL, rgb(FG_FAINT)))
        cx0, cx1 = (int(w * v) for v in SPANS[shape]["copy"])
        ex0, ex1 = (int(w * v) for v in SPANS[shape]["even"])
        edges = [round(h * r / ROWS) for r in range(ROWS + 1)]
        out = np.zeros((ROWS, 3), np.uint8)
        for r in range(ROWS):
            band = slice(edges[r], edges[r + 1])
            values = (np.percentile(text[band, cx0:cx1], 99), np.percentile(text[band, ex0:ex1], 99),
                      np.percentile(panel[band], 99))
            out[r] = [min(255, int(np.ceil(v * 255))) for v in values]
        rows[shape] = out
    return rows


# ------------------------------------------------------------------------- stages

def run_tool(args, cwd):
    r = subprocess.run(args, capture_output=True, text=True, cwd=cwd)
    if r.returncode != 0:
        sys.exit(f"{os.path.basename(args[0])} failed:\n{r.stderr[-2000:]}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--esrgan", default=os.environ.get("CLINICOS_ESRGAN"))
    p.add_argument("--rife", default=os.environ.get("CLINICOS_RIFE"))
    p.add_argument("--work", default=os.path.join(tempfile.gettempdir(), "clinicos-backdrop"))
    p.add_argument("--gpu")
    p.add_argument("--fresh", action="store_true")
    a = p.parse_args()
    if not a.esrgan or not a.rife:
        sys.exit("pass --esrgan and --rife (see the top of this file)")
    esrgan = os.path.join(a.esrgan, "realesrgan-ncnn-vulkan.exe" if os.name == "nt" else "realesrgan-ncnn-vulkan")
    rife = os.path.join(a.rife, "rife-ncnn-vulkan.exe" if os.name == "nt" else "rife-ncnn-vulkan")
    for tool in (esrgan, rife, SRC):
        if not os.path.exists(tool):
            sys.exit(f"missing {tool}")
    if a.fresh:
        shutil.rmtree(a.work, ignore_errors=True)
    os.makedirs(a.work, exist_ok=True)
    d_source, d_sr, d_master, d_rife = (os.path.join(a.work, n) for n in ("00_source", "01_sr", "02_master", "03_rife"))
    procs = max(2, (os.cpu_count() or 4) - 2)

    # 1. source frames, lossless
    if not stage_done(d_source, 190):
        fresh_dir(d_source)
        subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-i", SRC,
                        "-vf", "scale=in_color_matrix=bt601:flags=accurate_rnd+full_chroma_int,format=rgb24",
                        "-start_number", "0", os.path.join(d_source, "%08d.png")], check=True)
    sources = pngs(d_source)
    print(f"source: {len(sources)} frames", flush=True)

    gpu, gpu_name = (a.gpu, "as given") if a.gpu else detect_gpu(esrgan, sources[0], a.work)
    print(f"gpu: {gpu} {gpu_name}", flush=True)

    # 2. AI upscale, 4x
    if not stage_done(d_sr, len(sources)):
        fresh_dir(d_sr)
        run_tool([esrgan, "-i", d_source, "-o", d_sr, "-n", SR_MODEL, "-s", "4", "-f", "png", "-g", gpu, "-j", "2:4:4"],
                 cwd=os.path.dirname(esrgan))
    print(f"upscaled: {len(pngs(d_sr))} frames", flush=True)

    # 3. down to the master size
    if not stage_done(d_master, len(sources)):
        fresh_dir(d_master)
        with Pool(procs) as pool:
            pool.map(work_downscale, [(s, os.path.join(d_master, os.path.basename(s))) for s in pngs(d_sr)])
    masters = pngs(d_master)
    print(f"master: {len(masters)} frames at {MASTER[0]}x{MASTER[1]}", flush=True)

    # 4. AI interpolation. RIFE's folder mode spaces output frames evenly by
    # input/output count, so asking for count x FACTOR puts output k at source frame
    # k / FACTOR. Outputs past the last source frame are copies and are dropped.
    count = (len(masters) - 1) * FACTOR + 1
    if not stage_done(d_rife, count):
        fresh_dir(d_rife)
        run_tool([rife, "-i", d_master, "-o", d_rife, "-m", RIFE_MODEL, "-n", str(len(masters) * FACTOR),
                  "-g", gpu, "-j", "2:4:4", *(["-u"] if RIFE_UHD else [])], cwd=os.path.dirname(rife))
    frames = pngs(d_rife)[:count]
    print(f"interpolated: {len(frames)} frames ({TICKS_PER_SECOND} per second of film)", flush=True)

    with Pool(procs) as pool:
        thumbs = pool.map(work_thumb, frames, chunksize=16)
        probes = (1, 60, 120, len(masters) - 1)
        originals = pool.map(work_thumb, [masters[m] for m in probes])
    # Trust RIFE's spacing only after checking it: output m x FACTOR must be source frame m.
    for m, original in zip(probes, originals):
        err = float(np.abs(thumbs[m * FACTOR] - original).mean())
        if err > 1.5:
            sys.exit(f"interpolated frame {m * FACTOR} does not match source frame {m} (difference {err:.2f})")
    print("interpolation lines up with the source frames", flush=True)

    # 5. keep the frames that differ visibly from the last one kept
    kept = [0]
    for k in range(1, len(frames)):
        moved = float(np.abs(thumbs[k] - thumbs[kept[-1]]).mean())
        if moved >= KEEP_DIFF or k - kept[-1] >= MAX_GAP_TICKS or k == len(frames) - 1:
            kept.append(k)
    step = [float(np.abs(thumbs[kept[i + 1]] - thumbs[kept[i]]).mean()) for i in range(len(kept) - 1)]
    print(f"kept: {len(kept)} frames, largest change between neighbours {max(step):.2f}", flush=True)

    # 6. AVIF at every size, in parallel. Reused when the frames and the encoder
    # settings are exactly those of the last run, since this is the slow stage and
    # packing changes do not need it.
    avif_dir = os.path.join(a.work, "04_avif")
    settings = {"kept": hashlib.sha1(",".join(map(str, kept)).encode()).hexdigest(),
                "quality": AVIF_QUALITY, "speed": AVIF_SPEED, "tiers": {s: {t: list(v) for t, v in ts.items()} for s, ts in TIERS.items()}}
    marker = os.path.join(avif_dir, "settings.json")
    reuse = os.path.exists(marker) and json.load(open(marker)) == settings and all(
        len(os.listdir(os.path.join(avif_dir, f"{s}-{t}"))) == len(kept) for s, ts in TIERS.items() for t in ts)
    if not reuse:
        fresh_dir(avif_dir)
        for shape, tiers in TIERS.items():
            for tier in tiers:
                os.makedirs(os.path.join(avif_dir, f"{shape}-{tier}"))
        with Pool(procs) as pool:
            pool.map(work_encode, [(i, frames[k], avif_dir) for i, k in enumerate(kept)], chunksize=4)
        with open(marker, "w") as fh:
            json.dump(settings, fh)
    print("encoded" + (" (reused)" if reuse else ""), flush=True)

    # 7. packs
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    ticks = kept
    n = len(kept)

    def level(i):
        if i % 16 == 0 or i == n - 1 or ticks[i] <= HERO_SECONDS * TICKS_PER_SECOND:
            return 0
        if i % 16 == 8:
            return 1
        if i % 8 == 4:
            return 2
        if i % 4 == 2:
            return 3
        return 4

    sizes = {}
    for shape, tiers in TIERS.items():
        for tier in tiers:
            total = 0
            for lv in range(LEVELS):
                members = [i for i in range(n) if level(i) == lv]
                blobs = [open(os.path.join(avif_dir, f"{shape}-{tier}", f"{i:05d}.avif"), "rb").read() for i in members]
                offset = 8 + 12 * len(members)
                index = b""
                for i, blob in zip(members, blobs):
                    index += struct.pack("<III", i, offset, len(blob))
                    offset += len(blob)
                data = struct.pack("<4sI", b"CSQ1", len(members)) + index + b"".join(blobs)
                with open(os.path.join(OUT, f"{shape}-{tier}-{lv}.bin"), "wb") as fh:
                    fh.write(data)
                total += len(data)
                if lv == 0:
                    sizes[f"{shape}-{tier} first pack"] = len(data)
            sizes[f"{shape}-{tier} all packs"] = total

    # 8. posters: frame 0, as AVIF with a WebP fallback
    first = Image.open(frames[0]).convert("RGB")
    for shape in TIERS:
        im = oriented(first, shape).resize(TIERS[shape]["hd"], Image.LANCZOS, reducing_gap=3.0)
        im.save(os.path.join(OUT, f"{shape}-poster.avif"), "AVIF", quality=AVIF_QUALITY["hd"], speed=AVIF_SPEED)
        im.save(os.path.join(OUT, f"{shape}-poster.webp"), "WEBP", quality=88, method=6)

    # 9. readability tables
    text_fg = rgb(darkest_text_colour())
    with Pool(procs) as pool:
        rows = pool.map(work_table, [(frames[k], text_fg) for k in kept], chunksize=8)
    tables = {shape: np.stack([r[shape] for r in rows]) for shape in TIERS}
    for shape, table in tables.items():
        table.tofile(os.path.join(OUT, f"{shape}-table.bin"))

    # 10. share-preview still, from the opening while the left side is still dark
    og_frame = kept[int(np.argmin([abs(t - OG_SECONDS * TICKS_PER_SECOND) for t in kept]))]
    og = oriented(Image.open(frames[og_frame]).convert("RGB"), "landscape").resize((1200, 675), Image.LANCZOS, reducing_gap=3.0)
    og.crop((0, 22, 1200, 652)).save(OG, "JPEG", quality=88, optimize=True)

    # 11. manifest
    def poster(table):
        return "[" + ", ".join("[" + ",".join(str(int(v)) for v in table[0, :, c]) + "]" for c in range(3)) + "]"

    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(f"""// GENERATED by landing/scripts/backdrop.py. Do not hand-edit; re-run the script.
//
// The backdrop film: {n} frames, AI-upscaled and interpolated, not evenly spaced in time.
// TICKS gives each frame's moment in the film, in 1/{TICKS_PER_SECOND} s. Frames ship as AVIF
// in LEVELS packs per orientation and size; each table holds, for every frame and each of
// ROWS bands of the screen, [copy column, even veil, glass panel] as bytes (0-255 for
// opacity 0-1). See the script for how they are measured.

export const FRAMES = {n};
export const ROWS = {ROWS};
export const LEVELS = {LEVELS};
export const TICKS_PER_SECOND = {TICKS_PER_SECOND};
export const TICKS: readonly number[] = [{",".join(str(t) for t in ticks)}];

export const SHAPES = {{
  landscape: {{
    tiers: {{ hd: {{ width: 1920, height: 1080 }}, uhd: {{ width: 2560, height: 1440 }} }},
    poster: {{ avif: "{URL}/landscape-poster.avif", webp: "{URL}/landscape-poster.webp" }},
    table: "{URL}/landscape-table.bin",
  }},
  portrait: {{
    tiers: {{ hd: {{ width: 1080, height: 1920 }}, uhd: {{ width: 1440, height: 2560 }} }},
    poster: {{ avif: "{URL}/portrait-poster.avif", webp: "{URL}/portrait-poster.webp" }},
    table: "{URL}/portrait-table.bin",
  }},
}} as const;

export function packUrl(shape: keyof typeof SHAPES, tier: "hd" | "uhd", level: number) {{
  return `{URL}/${{shape}}-${{tier}}-${{level}}.bin`;
}}

/**
 * Frame 0 of each table: [copy column, even veil, glass panel], each a list of ROWS
 * bytes. It ships in the bundle so the poster is protected before the table file
 * arrives, and without it at all under reduced motion.
 */
export const POSTER: Record<keyof typeof SHAPES, readonly (readonly number[])[]> = {{
  landscape: {poster(tables["landscape"])},
  portrait: {poster(tables["portrait"])},
}};
""")

    print("\nsizes:")
    for k, v in sizes.items():
        print(f"  {k:32s} {v / 1024:8.0f} KB")
    t = {s: tables[s] / 255 for s in tables}
    print(f"max veil, landscape: copy {t['landscape'][..., 0].max():.2f}, even {t['landscape'][..., 1].max():.2f}, "
          f"panel {t['landscape'][..., 2].max():.2f}")
    print("wrote", os.path.relpath(MANIFEST, LANDING))


if __name__ == "__main__":
    main()
