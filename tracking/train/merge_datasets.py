"""Fold extra YOLO datasets (your own CCTV frames, Roboflow exports) into the training dataset.

Takes the Open Images dataset that prepare_weapon_data.py builds (or an empty folder) and
adds one or more extra datasets to it, in the same layout the training notebook reads:

    DATASET/images/train, DATASET/images/val, DATASET/labels/train, DATASET/labels/val,
    DATASET/data.yaml

Each extra dataset can be:
  - the output folder of extract_frames.py (images/, labels/, classes.txt)
  - a Roboflow "YOLOv8" export, as a .zip or an unzipped folder (train/, valid/, test/, data.yaml)
  - any folder with images/ + labels/ (+ optional train/val subfolders, data.yaml or classes.txt)

Class names are read from each dataset's data.yaml or classes.txt and mapped onto WatchDog's
classes (gun, knife) with --map; classes not in the map are dropped from the labels. Datasets
without a train/val split get an 85/15 split. --oversample repeats the extra images in the
train list so a few hundred CCTV frames are not drowned out by thousands of stock photos.

Usage:
    python merge_datasets.py --dataset /content/weapons --extra my_frames --oversample 5
    python merge_datasets.py --dataset /content/weapons --extra guns.v3.zip --extra my_frames \\
        --map "pistol=gun,rifle=gun,handgun=gun,weapon=gun,knife=knife" --oversample 5
"""

import argparse
import random
import re
import shutil
import sys
import tempfile
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

CLASS_NAMES = ["gun", "knife"]
DEFAULT_MAP = (
    "gun=gun,guns=gun,pistol=gun,pistols=gun,handgun=gun,handguns=gun,rifle=gun,rifles=gun,"
    "shotgun=gun,firearm=gun,firearms=gun,weapon=gun,weapons=gun,"
    "knife=knife,knives=knife,dagger=knife,blade=knife"
)
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
VAL_SHARE = 0.15
SEED = 0


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset", required=True, help="dataset folder to add to (created if missing)")
    parser.add_argument("--extra", action="append", required=True, help="extra dataset (folder or .zip); repeatable")
    parser.add_argument("--map", default=DEFAULT_MAP, help='class name mapping, e.g. "pistol=gun,knife=knife"')
    parser.add_argument("--oversample", type=int, default=1, help="repeat extra train images this many times")
    parser.add_argument("--val-share", type=float, default=VAL_SHARE, help="val share for unsplit datasets")
    return parser.parse_args()


def parse_map(text):
    mapping = {}
    for pair in text.split(","):
        if "=" not in pair:
            continue
        src, dst = (s.strip().lower() for s in pair.split("=", 1))
        if dst not in CLASS_NAMES:
            sys.exit(f"--map: '{dst}' is not one of {CLASS_NAMES}")
        mapping[src] = CLASS_NAMES.index(dst)
    return mapping


def read_names(root):
    """Class names of a dataset, from data.yaml (names: list or dict) or classes.txt."""
    for yaml_path in list(root.glob("*.yaml")) + list(root.glob("*.yml")):
        text = yaml_path.read_text(errors="ignore")
        m = re.search(r"^names:\s*(\[.*\])\s*$", text, re.M)
        if m:
            return [n.strip().strip("'\"") for n in m.group(1).strip("[]").split(",") if n.strip()]
        m = re.search(r"^names:\s*\n((?:\s+-?\s*\S.*\n?)+)", text, re.M)
        if m:
            names = {}
            for line in m.group(1).splitlines():
                item = re.match(r"\s+(?:(\d+)\s*:\s*|-\s*)(.+)$", line)
                if item:
                    idx = int(item.group(1)) if item.group(1) else len(names)
                    names[idx] = item.group(2).strip().strip("'\"")
            return [names[i] for i in sorted(names)]
    classes = root / "classes.txt"
    if classes.exists():
        return [l.strip() for l in classes.read_text().splitlines() if l.strip()]
    return None


def find_splits(root):
    """{split: [(image, label_or_None)]} for whatever layout the dataset uses."""
    splits = defaultdict(list)

    def pair_up(images_dir, labels_dir, split):
        for img in sorted(images_dir.rglob("*")):
            if img.suffix.lower() not in IMAGE_TYPES:
                continue
            rel = img.relative_to(images_dir).with_suffix(".txt")
            label = labels_dir / rel
            splits[split].append((img, label if label.exists() else None))

    for name, split in (("train", "train"), ("valid", "val"), ("val", "val"), ("test", "val")):
        sub = root / name
        if (sub / "images").is_dir():
            pair_up(sub / "images", sub / "labels", split)
    if splits:
        return splits
    images, labels = root / "images", root / "labels"
    if (images / "train").is_dir():
        pair_up(images / "train", labels / "train", "train")
        for v in ("val", "valid", "test"):
            if (images / v).is_dir():
                pair_up(images / v, labels / v, "val")
        return splits
    if images.is_dir():
        pair_up(images, labels, "unsplit")
    return splits


def convert_label(label, names, mapping, counts):
    """Rewrite a YOLO label file onto WatchDog's class ids; returns the new lines."""
    lines = []
    if label is None:
        return lines
    for line in label.read_text(errors="ignore").splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        try:
            idx = int(float(parts[0]))
        except ValueError:
            continue
        name = names[idx].lower() if names and idx < len(names) else CLASS_NAMES[idx] if idx < len(CLASS_NAMES) else None
        if name is None or name not in mapping:
            counts["dropped:" + str(name)] += 1
            continue
        cls = mapping[name]
        lines.append(" ".join([str(cls)] + parts[1:5]))
        counts[CLASS_NAMES[cls]] += 1
    return lines


def unpack(extra, tmp):
    path = Path(extra)
    if path.suffix.lower() == ".zip":
        target = tmp / path.stem
        with zipfile.ZipFile(path) as z:
            z.extractall(target)
        inner = [p for p in target.iterdir() if p.is_dir()]
        return inner[0] if len(inner) == 1 and not (target / "data.yaml").exists() else target
    return path


def main():
    args = parse_args()
    mapping = parse_map(args.map)
    rng = random.Random(SEED)
    dataset = Path(args.dataset)
    for split in ("train", "val"):
        (dataset / "images" / split).mkdir(parents=True, exist_ok=True)
        (dataset / "labels" / split).mkdir(parents=True, exist_ok=True)
    existing = {p.name for split in ("train", "val") for p in (dataset / "images" / split).iterdir()}
    oversampled = []
    summary = {}

    with tempfile.TemporaryDirectory() as tmp:
        for extra in args.extra:
            root = unpack(extra, Path(tmp))
            source = Path(extra).name
            names = read_names(root)
            splits = find_splits(root)
            if not splits:
                print(f"{source}: no images found (expected images/ or train/images/), skipping")
                continue
            if "unsplit" in splits:
                items = splits.pop("unsplit")
                rng.shuffle(items)
                n_val = int(len(items) * args.val_share)
                splits["val"] = items[:n_val]
                splits["train"] = items[n_val:]
            counts = Counter()
            added = Counter()
            prefix = re.sub(r"[^A-Za-z0-9]+", "_", Path(extra).stem)[:40]
            for split, items in splits.items():
                for img, label in items:
                    name = f"{prefix}__{img.stem}"
                    if f"{name}{img.suffix.lower()}" in existing:
                        counts["duplicates"] += 1
                        continue
                    existing.add(f"{name}{img.suffix.lower()}")
                    lines = convert_label(label, names, mapping, counts)
                    dest = dataset / "images" / split / f"{name}{img.suffix.lower()}"
                    shutil.copy(img, dest)
                    (dataset / "labels" / split / f"{name}.txt").write_text("\n".join(lines) + ("\n" if lines else ""))
                    added[split] += 1
                    if not lines:
                        counts["background images"] += 1
                    if split == "train":
                        oversampled.append(dest)
            summary[source] = (added, counts, names)

    # Oversampling: Ultralytics reads train images from a .txt list if data.yaml points at one.
    train_list = dataset / "train.txt"
    base_images = sorted(
        p for p in (dataset / "images" / "train").iterdir()
        if p.suffix.lower() in IMAGE_TYPES and p not in set(oversampled)
    )
    with train_list.open("w") as f:
        for p in base_images:
            f.write(f"{p.resolve()}\n")
        for _ in range(max(1, args.oversample)):
            for p in oversampled:
                f.write(f"{p.resolve()}\n")
    (dataset / "data.yaml").write_text(
        f"path: {dataset.resolve()}\n"
        "train: train.txt\n"
        "val: images/val\n"
        "names:\n" + "".join(f"  {i}: {name}\n" for i, name in enumerate(CLASS_NAMES))
    )

    print()
    for source, (added, counts, names) in summary.items():
        print(f"{source}: classes found {names or '(none; assumed gun,knife)'}")
        print(f"  added {added['train']} train + {added['val']} val images; "
              + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    print(f"\nTrain list: {len(base_images)} existing + {len(oversampled)} extra x{max(1, args.oversample)} "
          f"= {len(base_images) + len(oversampled) * max(1, args.oversample)} lines in {train_list}")
    print(f"Dataset ready: {dataset / 'data.yaml'}")


if __name__ == "__main__":
    main()
