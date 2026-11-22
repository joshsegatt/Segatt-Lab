"""Turns the lab scene art (generated images) into the files the app loads.

    python scripts/prepare-scene-art.py <folder with idle.png run.png work.png cheer.png shock.png bg.png props.png>

For each character sheet: removes a flat or checkerboard background, finds the
frames, crops them, puts the feet on one baseline in equal cells and saves a
WebP strip to public/scene. the props (props.png, or board.png ... net.png) become 7 equal cells; bg.png is resized.
Needs Pillow.
"""

import sys
from collections import deque
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "scene"
SHEETS = {"idle": 4, "run": 6, "work": 4, "cheer": 4, "shock": 4}
# The generator drew each pose at its own size; these bring the mascot to the
# idle size (measured by eye on head and boots). New art: re-check them.
SIZE = {"idle": 1.0, "run": 1.2, "work": 1.25, "cheer": 1.15, "shock": 1.08}
STATIONS = ["board", "cpu", "ram", "gpu", "display", "disk", "net"]  # src/lib/scene.ts order
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


def drop_specks(im: Image.Image, min_area: int = 500) -> Image.Image:
    """Removes the loose specks image generators leave around a figure (small
    islands of pixels not connected to anything bigger)."""
    w, h = im.size
    px = im.load()
    alpha = im.getchannel("A").load()
    seen = bytearray(w * h)
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0 * w + x0] or alpha[x0, y0] <= 40:
                continue
            comp, q = [], deque([(x0, y0)])
            seen[y0 * w + x0] = 1
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and alpha[nx, ny] > 40:
                        seen[ny * w + nx] = 1
                        q.append((nx, ny))
            if len(comp) < min_area:
                for x, y in comp:
                    px[x, y] = (0, 0, 0, 0)
    # Faint haze below the threshold goes too.
    for y in range(h):
        for x in range(w):
            if 0 < alpha[x, y] <= 40:
                px[x, y] = (0, 0, 0, 0)
    return im


def split(im: Image.Image, n: int, rows: tuple[int, int] | None = None) -> list[Image.Image]:
    """The n figures of a strip: by empty columns when they are clean, else equal slices.
    With `rows`, every frame keeps that vertical window, so a jump stays a jump."""
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
        if box and rows:
            box = (box[0], rows[0], box[2], rows[1])
        frames.append(part.crop(box) if box else part)
    return frames


def opaque_rows(im: Image.Image) -> tuple[int, int]:
    box = im.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
    return (box[1], box[3]) if box else (0, im.height)


def strip(frames: list[Image.Image], cell_h: int, scale: float | None = None) -> Image.Image:
    """Equal cells, feet on the bottom edge, centred; scaled so the tallest frame fills the cell,
    or by `scale` when given (then the cell is as tall as the scaled frames)."""
    tallest = max(f.height for f in frames)
    if scale is None:
        scale = cell_h / tallest
    else:
        cell_h = round(tallest * scale)
    scaled = [f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.LANCZOS) for f in frames]
    cell_w = max(f.width for f in scaled) + 8
    out = Image.new("RGBA", (cell_w * len(scaled), cell_h), (0, 0, 0, 0))
    for i, f in enumerate(scaled):
        out.alpha_composite(f, (i * cell_w + (cell_w - f.width) // 2, cell_h - f.height))
    return out


def main(src: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # One vertical window for every pose: the generator drew them at one scale,
    # so the mascot keeps his size between poses and jumps stay off the floor.
    sheets = {}
    for name in SHEETS:
        f = src / f"{name}.png"
        if f.exists():
            sheets[name] = drop_specks(clear_background(Image.open(f)))
        else:
            print(f"skip {name}: no {f.name}")
    if sheets:
        # Each pose keeps its own vertical window (a jump stays a jump); one unit
        # of scale, set by idle, keeps the mascot the same size in every pose.
        unit = None
        for name, im in sheets.items():
            rows = opaque_rows(im)
            if unit is None:
                unit = CELL_H / (rows[1] - rows[0])
            s = strip(split(im, SHEETS[name], rows), CELL_H, unit * SIZE[name])
            s.save(OUT / f"{name}.webp", "WEBP", quality=92, method=6)
            print(f"{name}: {SHEETS[name]} frames, {s.width}x{s.height}")
    # Props: one sheet with 7 cells, or one file per station (board.png ... net.png).
    props = src / "props.png"
    singles = [src / f"{s}.png" for s in STATIONS]
    frames = None
    if all(f.exists() for f in singles):
        frames = []
        for f in singles:
            im = clear_background(Image.open(f))
            box = im.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
            frames.append(im.crop(box) if box else im)
    elif props.exists():
        frames = split(drop_specks(clear_background(Image.open(props))), 7)
    if frames:
        p = strip(frames, PROP_H)
        p.save(OUT / "props.webp", "WEBP", quality=92, method=6)
        print(f"props: 7 cells, {p.width}x{p.height}")
    else:
        print("skip props: need props.png or all of " + ", ".join(f"{s}.png" for s in STATIONS))
    bg = src / "bg.png"
    if bg.exists():
        b = Image.open(bg).convert("RGB")
        b = b.resize((round(b.width * 1080 / b.height), 1080), Image.LANCZOS)
        b.save(OUT / "bg.webp", "WEBP", quality=88, method=6)
        print(f"bg: {b.width}x{b.height}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
