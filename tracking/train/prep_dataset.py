"""Clean up YOLO datasets so training sees good, varied images and no junk.

For every dataset folder given (images/, labels/, classes.txt, as fetch_datasets.py and
extract_frames.py make them), in place:

  - drops images that will not open, or are smaller than --min-side pixels;
  - drops exact and near duplicates (perceptual hash), which otherwise let one video
    frame count ten times and leak between the train and validation splits;
  - shrinks images so the longest side is --max-side (640, the training size) and
    re-saves them as quality-92 JPEGs with EXIF rotation applied, which cuts disk use
    by about 5x with no effect on training;
  - fixes labels: clips boxes to the image, drops boxes thinner than 2 pixels or with
    a class index that is not in classes.txt, and removes label files for dropped images.

A report of what was removed goes to <dataset>/prep_report.txt. Needs Pillow only.

Usage:
    python prep_dataset.py datasets/granada_sohas datasets/granada_pistol
    python prep_dataset.py datasets/*            (every dataset at once)
    python prep_dataset.py my_frames --max-side 960
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow is not installed. Run: pip install pillow")

IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
HASH_SIZE = 8 # 8x8 difference hash = 64 bits


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("datasets", nargs="+", help="dataset folders with images/ and labels/")
    parser.add_argument("--max-side", type=int, default=640, help="shrink longest side to this (0 = keep size)")
    parser.add_argument("--min-side", type=int, default=64, help="drop images smaller than this")
    parser.add_argument("--near", type=int, default=4, help="hash bits that may differ for a near duplicate (0 = exact only)")
    parser.add_argument("--quality", type=int, default=92, help="JPEG quality to re-save at")
    return parser.parse_args()


def dhash(img):
    """64-bit difference hash: robust to resizing and small compression changes."""
    small = img.convert("L").resize((HASH_SIZE + 1, HASH_SIZE), Image.Resampling.LANCZOS)
    px = list(small.getdata())
    bits = 0
    for row in range(HASH_SIZE):
        for col in range(HASH_SIZE):
            left = px[row * (HASH_SIZE + 1) + col]
            right = px[row * (HASH_SIZE + 1) + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return bits


def hamming(a, b):
    return bin(a ^ b).count("1")


def clean_labels(path, classes, width, height):
    """Rewrite a label file with only valid boxes; returns (kept, dropped)."""
    kept, dropped = [], 0
    if not path.exists():
        path.write_text("")
        return 0, 0
    for line in path.read_text().splitlines():
        parts = line.split()
        if len(parts) < 5:
            dropped += bool(parts)
            continue
        try:
            cls = int(float(parts[0]))
            cx, cy, w, h = (float(v) for v in parts[1:5])
        except ValueError:
            dropped += 1
            continue
        if classes and not 0 <= cls < len(classes):
            dropped += 1
            continue
        x1, y1 = max(0.0, cx - w / 2), max(0.0, cy - h / 2)
        x2, y2 = min(1.0, cx + w / 2), min(1.0, cy + h / 2)
        if (x2 - x1) * width < 2 or (y2 - y1) * height < 2:
            dropped += 1
            continue
        kept.append("{} {:.6f} {:.6f} {:.6f} {:.6f}".format(cls, (x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1))
    path.write_text("\n".join(kept))
    return len(kept), dropped


def prep(folder, args):
    folder = Path(folder)
    images_dir, labels_dir = folder / "images", folder / "labels"
    if not images_dir.is_dir():
        print(f"{folder}: no images/ folder, skipping")
        return
    labels_dir.mkdir(exist_ok=True)
    classes_file = folder / "classes.txt"
    classes = [l.strip() for l in classes_file.read_text().splitlines() if l.strip()] if classes_file.exists() else []

    images = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in IMAGE_TYPES)
    print(f"{folder.name}: {len(images)} images")
    removed = {"unreadable": 0, "too small": 0, "duplicate": 0}
    boxes_kept = boxes_dropped = 0
    hashes = []  # (hash, name) of kept images, for near-duplicate checks
    exact = {}
    kept = 0

    for i, img_path in enumerate(images, 1):
        label = labels_dir / f"{img_path.stem}.txt"
        try:
            with Image.open(img_path) as im:
                im = ImageOps.exif_transpose(im).convert("RGB")
                w, h = im.size
                if min(w, h) < args.min_side:
                    raise ValueError("too small")
                key = dhash(im)
                dup = key in exact
                if not dup and args.near > 0:
                    dup = any(hamming(key, other) <= args.near for other, _ in hashes[-5000:])
                if dup:
                    removed["duplicate"] += 1
                    img_path.unlink()
                    label.unlink(missing_ok=True)
                    continue
                exact[key] = img_path.name
                hashes.append((key, img_path.name))
                if args.max_side and max(w, h) > args.max_side:
                    s = args.max_side / max(w, h)
                    im = im.resize((round(w * s), round(h * s)), Image.Resampling.LANCZOS)
                    w, h = im.size
                dest = img_path.with_suffix(".jpg")
                im.save(dest, "JPEG", quality=args.quality, optimize=True)
                if dest != img_path:
                    img_path.unlink()
        except ValueError:
            removed["too small"] += 1
            img_path.unlink()
            label.unlink(missing_ok=True)
            continue
        except Exception:
            removed["unreadable"] += 1
            img_path.unlink(missing_ok=True)
            label.unlink(missing_ok=True)
            continue
        k, d = clean_labels(label, classes, w, h)
        boxes_kept += k
        boxes_dropped += d
        kept += 1
        if i % 500 == 0:
            print(f"  {i}/{len(images)} ...")

    # Labels whose image is gone.
    names = {p.stem for p in images_dir.iterdir()}
    orphans = [p for p in labels_dir.glob("*.txt") if p.stem not in names]
    for p in orphans:
        p.unlink()

    report = (
        f"kept {kept} images, {boxes_kept} boxes\n"
        f"removed: {removed['unreadable']} unreadable, {removed['too small']} too small, "
        f"{removed['duplicate']} duplicates; {boxes_dropped} bad boxes; {len(orphans)} orphan label files\n"
        f"images shrunk to max {args.max_side}px, JPEG quality {args.quality}\n"
    )
    (folder / "prep_report.txt").write_text(report)
    print("  " + report.replace("\n", "\n  ").rstrip())


def main():
    args = parse_args()
    for folder in args.datasets:
        prep(folder, args)


if __name__ == "__main__":
    main()
