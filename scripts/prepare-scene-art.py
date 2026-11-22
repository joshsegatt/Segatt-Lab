"""Turns the lab scene art (generated images) into the files the app loads.

    python scripts/prepare-scene-art.py <folder with idle.png run.png work.png cheer.png shock.png bg.png props.png>

For each character sheet: removes a flat or checkerboard background, finds the
frames, crops them, puts the feet on one baseline in equal cells and saves a
WebP strip to public/scene. props.png becomes 7 equal cells; bg.png is resized.
Needs Pillow.
"""

import sys
from collections import deque
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "scene"
SHEETS = {"idle": 4, "run": 6, "work": 4, "cheer": 4, "shock": 4}
CELL_H = 440  # sprite cell height: twice the on-screen height, for sharp HiDPI
PROP_H = 400


def close(a, b, tol=28):
    return all(abs(x - y) <= tol for x, y in zip(a[:3], b[:3]))


def clear_background(im: Image.Image) -> Image.Image:
    """Makes the background transparent when the image has none: flood fill from
    the edges over the corner colours (one flat colour, or the two of a fake
    checkerboard)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    edge_alpha = [px[x, 0][3] for x in range(0, w, 7)] + [px[0, y][3] for y in range(0, h, 7)]
    if min(edge_alpha) < 10:
        return im  # already transparent
    samples = [px[x, y] for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (8, 0), (0, 8), (16, 0), (0, 16)]]
    keys = []
    for s in samples:
        if not any(close(s, k, 12) for k in keys):
            keys.append(s)
    seen = bytearray(w * h)
    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not any(close(px[x, y], k) for k in keys):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    return im


def split(im: Image.Image, n: int) -> list[Image.Image]:
    """The n figures of a strip: by empty columns when they are clean, else equal slices."""
    w, h = im.size
    alpha = im.getchannel("A")
    filled = [any(alpha.getpixel((x, y)) > 20 for y in range(0, h, 2)) for x in range(w)]
    runs, start = [], None
    for x, f in enumerate(filled + [False]):
        if f and start is None:
            start = x
        elif not f and start is not None:
            if x - start > w * 0.02:
                runs.append((start, x))
            start = None
    if len(runs) != n:
        runs = [(round(i * w / n), round((i + 1) * w / n)) for i in range(n)]
    frames = []
    for a, b in runs:
        part = im.crop((a, 0, b, h))
        box = part.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
        frames.append(part.crop(box) if box else part)
    return frames


def strip(frames: list[Image.Image], cell_h: int) -> Image.Image:
    """Equal cells, feet on the bottom edge, centred; scaled so the tallest frame fills the cell."""
    tallest = max(f.height for f in frames)
    scale = cell_h / tallest
    scaled = [f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.LANCZOS) for f in frames]
    cell_w = max(f.width for f in scaled) + 8
    out = Image.new("RGBA", (cell_w * len(scaled), cell_h), (0, 0, 0, 0))
    for i, f in enumerate(scaled):
        out.alpha_composite(f, (i * cell_w + (cell_w - f.width) // 2, cell_h - f.height))
    return out


def main(src: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, n in SHEETS.items():
        f = src / f"{name}.png"
        if not f.exists():
            print(f"skip {name}: no {f.name}")
            continue
        s = strip(split(clear_background(Image.open(f)), n), CELL_H)
        s.save(OUT / f"{name}.webp", "WEBP", quality=92, method=6)
        print(f"{name}: {n} frames, {s.width}x{s.height}")
    props = src / "props.png"
    if props.exists():
        p = strip(split(clear_background(Image.open(props)), 7), PROP_H)
        p.save(OUT / "props.webp", "WEBP", quality=92, method=6)
        print(f"props: 7 cells, {p.width}x{p.height}")
    bg = src / "bg.png"
    if bg.exists():
        b = Image.open(bg).convert("RGB")
        b = b.resize((round(b.width * 1080 / b.height), 1080), Image.LANCZOS)
        b.save(OUT / "bg.webp", "WEBP", quality=88, method=6)
        print(f"bg: {b.width}x{b.height}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
