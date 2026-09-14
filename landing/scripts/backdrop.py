"""
Builds the landing site's backdrop from the source film.

    pip install imageio-ffmpeg numpy pillow
    python landing/scripts/backdrop.py

Input:   landing/media/backdrop-source.mp4      720x1280 portrait, 60 fps, 3.17 s
Output:  landing/public/backdrop/glass-{landscape,portrait}-v1.mp4    the film
         landing/public/backdrop/glass-{landscape,portrait}-v1.webp   its first frame, the poster
         landing/public/backdrop/glass-{landscape,portrait}-v1.bin    the readability table
         landing/media/og-backdrop.jpg                 still for the share preview
         landing/src/components/backdrop-frames.ts   (generated, do not hand-edit)

Why each step is here:

- Wide screens get the film rotated a quarter-turn clockwise, not cropped. A 16:9
  crop keeps a third of the frame and enlarges it 2.7x; rotating keeps all of it.
  Clockwise specifically, because that way round the left side, where the copy
  sits, stays darkest through the opening second (mean luminance 0.08, against
  0.22 for the other way). Phones get the original portrait frame.
- deband runs first. The source is 850 kb/s H.264, and its near-black gradients
  step visibly once they are enlarged.
- Lanczos up to 1080p, then a light luma-only unsharp, so the thin glass rims stay
  crisp instead of smearing. Colour is converted BT.601 -> BT.709 on the way:
  browsers treat untagged HD video as BT.709, and skipping this shifts the greens.
- A keyframe every 6 frames. The page scrubs this video with scroll, and a seek
  lands on a keyframe and decodes forward from it. Every frame a keyframe was 2.4x
  the size for no visible gain; 6 keeps the worst seek to five decodes.
- The readability table. For every frame, and for each of 24 horizontal bands of
  the screen, it holds the least darkening that text in that band needs to reach
  4.5:1: over the copy column, across a centred section, and under a glass panel.
  The page checks which bands have text in them at that moment and darkens only as
  much as those bands need. So the light across the top of the opening is left
  alone while the headline sits in the dark middle of the frame.
  One figure per frame for the whole column was tried first and lost either way.
  Measured over the full height, it dimmed the opening for text nowhere near the
  light. Measured over the middle 80%, a label scrolling in at the edge of the
  screen fell to 2.2:1.
- How a band is measured: for each pixel, the least veil that makes that pixel dark
  enough, then the 99th percentile across the band. Each analysis pixel averages a
  square of about 4.5 CSS px, so a hairline rim barely counts and a band of light
  counts in full. The target is 4.8:1 rather than 4.5, and values round up, to leave
  headroom for the difference between this analysis and the browser's own scaling.

If the film changes, bump VERSION so the year-long cache on /backdrop/ never
serves the old one (see next.config.ts).

The colours below must match globals.css (--veil, --panel-rgb, --fg-dim, --fg-faint).
"""

import os
import re
import subprocess
import sys

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
LANDING = os.path.dirname(HERE)
SRC = os.path.join(LANDING, "media", "backdrop-source.mp4")
OUT = os.path.join(LANDING, "public", "backdrop")
OG = os.path.join(LANDING, "media", "og-backdrop.jpg")
SCENES = os.path.join(LANDING, "src", "components", "scenes.ts")
MANIFEST = os.path.join(LANDING, "src", "components", "backdrop-frames.ts")
VERSION = "v1"
FF = imageio_ffmpeg.get_ffmpeg_exe()

FPS = 60
ROWS = 24
OG_TIME = "0.35"                       # seconds into the film for the share-preview still
TARGET = 4.8                           # 4.5:1 plus headroom, see above
GROUND = np.array([1, 6, 4], float)    # --veil
PANEL = np.array([3, 11, 10], float)   # --panel-rgb
FG_DIM = "#b4c7c1"                     # --fg-dim: body copy on the film
FG_FAINT = "#93aaa3"                   # --fg-faint: small print inside panels
PANEL_MIN = 0.34                       # below this a panel stops reading as glass
BLUR_PX = 24                           # backdrop-filter: blur(24px) on .glass

DEBAND = "deband=1thr=0.012:2thr=0.012:3thr=0.012:4thr=0.012:range=16:blur=1"
SCALE = "flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt601:out_color_matrix=bt709"
SHARPEN = "unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.35:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0"

# "copy" and "even" are the horizontal spans, as fractions of the frame's width, that
# text can occupy with each veil. Phones centre everything, so both are the same.
VARIANTS = {
    "landscape": {"size": (1920, 1080), "pre": "transpose=1,", "analysis": (320, 180),
                  "copy": (0.05, 0.62), "even": (0.05, 0.95)},
    "portrait": {"size": (1080, 1920), "pre": "", "analysis": (180, 320),
                 "copy": (0.06, 0.94), "even": (0.06, 0.94)},
}


def run(args):
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def rgb(hexstr):
    return np.array([int(hexstr[i:i + 2], 16) for i in (1, 3, 5)], float)


def luminance(c):
    c = np.asarray(c, float) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def encode(name, spec):
    w, h = spec["size"]
    vf = f"{DEBAND},{spec['pre']}scale={w}:{h}:{SCALE},{SHARPEN},format=yuv420p"
    dst = os.path.join(OUT, f"glass-{name}-{VERSION}.mp4")
    run([
        "-i", SRC, "-an", "-vf", vf,
        "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-tune", "film", "-profile:v", "high",
        "-x264-params", "keyint=6:min-keyint=6:scenecut=0:bframes=0",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-movflags", "+faststart", dst,
    ])
    # The poster is the encoded video's own first frame, so the moment the video
    # takes over from it there is no shift in colour or sharpness.
    run(["-i", dst, "-frames:v", "1", "-vf", "scale=in_color_matrix=bt709,format=rgb24",
         "-c:v", "libwebp", "-quality", "88", os.path.join(OUT, f"glass-{name}-{VERSION}.webp")])
    return dst


def decode_small(path, w, h):
    """Every frame of the encoded video, downscaled for measurement, as RGB."""
    raw = subprocess.run(
        [FF, "-hide_banner", "-loglevel", "error", "-i", path,
         "-vf", f"scale={w}:{h}:flags=area:in_color_matrix=bt709,format=rgb24",
         "-f", "rawvideo", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w, 3).astype(np.float64)


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


def blurred(frame, sigma):
    im = Image.fromarray(frame.astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma))
    return np.asarray(im, dtype=np.float64)


def measure(path, spec, text_fg):
    w, h = spec["analysis"]
    frames = decode_small(path, w, h)
    # The panels' blur in analysis pixels, as it would be on a 1440 px wide screen.
    # Phones blur more per pixel of film than that, so this errs on the safe side.
    sigma = BLUR_PX * max(w, h) / 1440
    cx0, cx1 = (int(w * f) for f in spec["copy"])
    ex0, ex1 = (int(w * f) for f in spec["even"])
    edges = [round(h * r / ROWS) for r in range(ROWS + 1)]
    faint = rgb(FG_FAINT)
    table = np.zeros((len(frames), ROWS, 3), np.uint8)
    for i, f in enumerate(frames):
        text = least_veil(f, GROUND, text_fg)
        panel = np.maximum(PANEL_MIN, least_veil(blurred(f, sigma), PANEL, faint))
        for r in range(ROWS):
            band = slice(edges[r], edges[r + 1])
            values = (
                np.percentile(text[band, cx0:cx1], 99),
                np.percentile(text[band, ex0:ex1], 99),
                np.percentile(panel[band], 99),
            )
            table[i, r] = [min(255, int(np.ceil(v * 255))) for v in values]
    return table


def main():
    if not os.path.exists(SRC):
        sys.exit(f"missing {SRC}")
    os.makedirs(OUT, exist_ok=True)

    text_fg = rgb(darkest_text_colour())
    tables = {}
    for name, spec in VARIANTS.items():
        path = encode(name, spec)
        tables[name] = measure(path, spec, text_fg)
        t = tables[name] / 255
        print(f"{name:9s} {len(t)} frames, video {os.path.getsize(path) // 1024} KB, "
              f"max veil: copy {t[..., 0].max():.2f}, even {t[..., 1].max():.2f}, panel {t[..., 2].max():.2f}")

    # The share preview uses the film too: a frame from the opening, while the left
    # side is still dark enough to carry the headline. JPEG, because the renderer
    # behind next/og does not read WebP.
    run(["-ss", OG_TIME, "-i", os.path.join(OUT, f"glass-landscape-{VERSION}.mp4"), "-frames:v", "1",
         "-vf", "scale=w=1200:h=675:flags=lanczos:in_color_matrix=bt709:out_color_matrix=bt601:out_range=full,"
                "crop=1200:630,format=yuvj420p",
         "-q:v", "3", OG])

    n = min(len(t) for t in tables.values())
    for name, table in tables.items():
        table[:n].tofile(os.path.join(OUT, f"glass-{name}-{VERSION}.bin"))

    def poster(table):
        return "[" + ", ".join("[" + ",".join(str(int(v)) for v in table[0, :, c]) + "]" for c in range(3)) + "]"

    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(f"""// GENERATED by landing/scripts/backdrop.py. Do not hand-edit; re-run the script.
//
// The backdrop film, its poster, and its readability table: for every frame and
// each of ROWS horizontal bands of the screen, the least darkening that text in
// that band needs, as bytes (0-255 for opacity 0-1). A frame's entry for a band is
// [copy column, even veil, glass panel]. See the script for how it is measured.

export const FPS = {FPS};
export const FRAMES = {n};
export const ROWS = {ROWS};

export const SOURCES = {{
  landscape: {{
    video: "/backdrop/glass-landscape-{VERSION}.mp4",
    poster: "/backdrop/glass-landscape-{VERSION}.webp",
    table: "/backdrop/glass-landscape-{VERSION}.bin",
    width: 1920,
    height: 1080,
  }},
  portrait: {{
    video: "/backdrop/glass-portrait-{VERSION}.mp4",
    poster: "/backdrop/glass-portrait-{VERSION}.webp",
    table: "/backdrop/glass-portrait-{VERSION}.bin",
    width: 1080,
    height: 1920,
  }},
}} as const;

/**
 * Frame 0 of each table: [copy column, even veil, glass panel], each a list of ROWS
 * bytes. It ships in the bundle so the poster is protected before the table file
 * arrives, and without it at all under reduced motion.
 */
export const POSTER: Record<keyof typeof SOURCES, readonly (readonly number[])[]> = {{
  landscape: {poster(tables["landscape"])},
  portrait: {poster(tables["portrait"])},
}};
""")
    print("wrote", os.path.relpath(MANIFEST, LANDING))


if __name__ == "__main__":
    main()
