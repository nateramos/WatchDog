"""Make a preview sheet of the WatchDog training set: a few images from each dataset with the
gun (red) and knife (yellow) boxes drawn on, plus a few of the CCTV-style copies.

Saves tracking/train/dataset_preview.jpg (and dataset_preview_cctv.jpg). Run it any time after
train_full_pc.py has built the dataset; it is safe to run while training is going.
"""
import os
import random
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(os.environ.get("WATCHDOG_DATA", r"C:\watchdog_data"))
DATA = ROOT / "dataset"
OUT = Path(__file__).resolve().parent
PER_SOURCE = 6
TILE = 260
COLORS = {0: (239, 68, 68), 1: (250, 204, 21)}
NAMES = {0: "gun", 1: "knife"}
random.seed(1)


def tile(img_path):
    im = Image.open(img_path).convert("RGB")
    w, h = im.size
    lbl = DATA / "labels" / img_path.parent.name / (img_path.stem + ".txt")
    d = ImageDraw.Draw(im)
    n = 0
    if lbl.exists():
        for line in lbl.read_text().splitlines():
            p = line.split()
            if len(p) < 5:
                continue
            c, cx, cy, bw, bh = int(p[0]), *map(float, p[1:5])
            x1, y1, x2, y2 = (cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h
            d.rectangle([x1, y1, x2, y2], outline=COLORS.get(c, (255, 255, 255)), width=max(2, w // 200))
            n += 1
    im.thumbnail((TILE, TILE))
    canvas = Image.new("RGB", (TILE, TILE + 18), (20, 20, 20))
    canvas.paste(im, ((TILE - im.size[0]) // 2, (TILE - im.size[1]) // 2))
    ImageDraw.Draw(canvas).text((4, TILE + 3), f"{n} box(es)" if n else "no weapon", fill=(200, 200, 200))
    return canvas


def sheet(groups, path):
    rows = []
    for name, paths in groups:
        row = Image.new("RGB", (200 + TILE * PER_SOURCE, TILE + 18), (12, 12, 12))
        ImageDraw.Draw(row).text((8, TILE // 2), name, fill=(255, 255, 255))
        for i, p in enumerate(paths[:PER_SOURCE]):
            row.paste(tile(p), (200 + i * TILE, 0))
        rows.append(row)
    if not rows:
        print("No images found in", DATA)
        return
    out = Image.new("RGB", (rows[0].size[0], sum(r.size[1] for r in rows)))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.size[1]
    out.save(path, quality=88)
    print("Saved", path)


def main():
    imgs = sorted((DATA / "images" / "train").glob("*.jpg")) + sorted((DATA / "images" / "val").glob("*.jpg"))
    if not imgs:
        print("The dataset has not been built yet; run this again after step 4 of train_full_pc.py.")
        return
    by_src = defaultdict(list)
    cctv = []
    for p in imgs:
        if p.stem.endswith("_cctv"):
            cctv.append(p)
            continue
        src = p.stem.rsplit("_", 1)[0]  # files are named <source>_<hash>.jpg
        by_src[src].append(p)
    groups = []
    for src in sorted(by_src):
        paths = by_src[src]
        random.shuffle(paths)
        # Show mostly images that have boxes, so wrong labels are easy to spot.
        with_boxes = [p for p in paths if (DATA / "labels" / p.parent.name / (p.stem + ".txt")).stat().st_size > 0]
        pick = with_boxes[: PER_SOURCE - 1] + [p for p in paths if p not in with_boxes][:1]
        groups.append((f"{src}\n({len(paths)} images)", pick))
    sheet(groups, OUT / "dataset_preview.jpg")
    random.shuffle(cctv)
    sheet([("CCTV-style copies", cctv[:PER_SOURCE]), ("", cctv[PER_SOURCE:2 * PER_SOURCE])], OUT / "dataset_preview_cctv.jpg")


if __name__ == "__main__":
    main()
