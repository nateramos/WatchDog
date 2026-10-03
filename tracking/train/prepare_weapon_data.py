"""Build a YOLO weapon-detection dataset from Google's Open Images.

Labels:
    0 gun    (Open Images: Handgun, Rifle, Shotgun)
    1 knife  (Open Images: Knife, Kitchen knife, Dagger)

Also adds look-alike photos with no weapon in them (umbrellas, phones, tools,
cameras...) as background images, so the model learns what *isn't* a weapon.

Open Images annotations are CC BY 4.0; images are listed as CC BY 2.0.
https://storage.googleapis.com/openimages/web/index.html

Usage (made for Google Colab; the training annotations file is ~2.3 GB):
    python prepare_weapon_data.py --out /content/weapons
    python prepare_weapon_data.py --out /tmp/weapons --quick   # small smoke test
"""

import argparse
import random
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import pandas as pd
from PIL import Image

ANNOTATIONS = {
    "train": "https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-bbox.csv",
    "validation": "https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv",
    "test": "https://storage.googleapis.com/openimages/v5/test-annotations-bbox.csv",
}
IMAGE_URL = "https://open-images-dataset.s3.amazonaws.com/{split}/{image_id}.jpg"

CLASS_NAMES = ["gun", "knife"]
WEAPON_LABELS = {
    "/m/0gxl3": 0,  # Handgun
    "/m/06c54": 0,  # Rifle
    "/m/06nrc": 0,  # Shotgun
    "/m/04ctx": 1,  # Knife
    "/m/058qzx": 1,  # Kitchen knife
    "/m/02gzp": 1,  # Dagger
}
# Images with these boxes are skipped: they're weapons we don't label, and
# leaving them unlabeled would teach the model they're background.
SKIP_LABELS = {
    "/m/083kb",  # Weapon (unspecified)
    "/m/06y5r",  # Sword
}
LOOKALIKE_LABELS = {
    "/m/0hnnb",  # Umbrella
    "/m/050k8",  # Mobile phone
    "/m/01kb5b",  # Flashlight
    "/m/03l9g",  # Hammer
    "/m/01j5ks",  # Wrench
    "/m/01bms0",  # Screwdriver
    "/m/0qjjc",  # Remote control
    "/m/073bxn",  # Tripod
    "/m/0dv5r",  # Camera
}

DUPLICATE_IOU = 0.8  # same-class boxes overlapping this much are one object
MAX_SIDE = 640  # images are shrunk to this on download; YOLO trains at 640
SEED = 0


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", required=True, help="output folder for the dataset")
    parser.add_argument("--cache", default="oi_cache", help="where to keep annotation CSVs")
    parser.add_argument(
        "--lookalike-ratio",
        type=float,
        default=0.3,
        help="look-alike images to add, as a fraction of weapon images (default 0.3)",
    )
    parser.add_argument("--workers", type=int, default=32, help="parallel image downloads")
    parser.add_argument(
        "--quick", action="store_true", help="tiny dataset from the validation split only"
    )
    return parser.parse_args()


def download(url, path):
    if not path.exists():
        print(f"Downloading {url} ...")
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(path)
    return path


def load_boxes(csv_path):
    """Return the rows for labels we care about, read in chunks to save memory."""
    wanted = set(WEAPON_LABELS) | SKIP_LABELS | LOOKALIKE_LABELS
    columns = ["ImageID", "LabelName", "XMin", "XMax", "YMin", "YMax"]
    chunks = [
        chunk[chunk["LabelName"].isin(wanted)]
        for chunk in pd.read_csv(csv_path, usecols=columns, chunksize=2_000_000)
    ]
    return pd.concat(chunks)


def iou(a, b):
    ix = max(min(a.XMax, b.XMax) - max(a.XMin, b.XMin), 0)
    iy = max(min(a.YMax, b.YMax) - max(a.YMin, b.YMin), 0)
    inter = ix * iy
    union = (a.XMax - a.XMin) * (a.YMax - a.YMin) + (b.XMax - b.XMin) * (b.YMax - b.YMin) - inter
    return inter / union if union > 0 else 0


def weapon_boxes(rows):
    """Weapon rows with duplicates removed.

    One object is sometimes tagged twice (e.g. both Rifle and Shotgun), which
    becomes two "gun" boxes once the labels are merged.
    """
    kept = []
    for row in rows:
        if row.LabelName not in WEAPON_LABELS:
            continue
        cls = WEAPON_LABELS[row.LabelName]
        if not any(
            WEAPON_LABELS[k.LabelName] == cls and iou(row, k) > DUPLICATE_IOU for k in kept
        ):
            kept.append(row)
    return kept


def pick_images(boxes, lookalike_ratio, rng):
    """Return {image_id: [yolo label lines]}; look-alike images get no lines."""
    by_image = defaultdict(list)
    for row in boxes.itertuples(index=False):
        by_image[row.ImageID].append(row)

    weapons, lookalikes = {}, []
    for image_id, rows in by_image.items():
        labels = {row.LabelName for row in rows}
        if labels & SKIP_LABELS:
            continue
        if labels & set(WEAPON_LABELS):
            weapons[image_id] = [
                "{} {:.6f} {:.6f} {:.6f} {:.6f}".format(
                    WEAPON_LABELS[row.LabelName],
                    (row.XMin + row.XMax) / 2,
                    (row.YMin + row.YMax) / 2,
                    row.XMax - row.XMin,
                    row.YMax - row.YMin,
                )
                for row in weapon_boxes(rows)
            ]
        else:
            lookalikes.append(image_id)

    rng.shuffle(lookalikes)
    count = int(len(weapons) * lookalike_ratio)
    return weapons | {image_id: [] for image_id in lookalikes[:count]}


def save_image(split, image_id, path):
    if path.exists():
        return True
    try:
        url = IMAGE_URL.format(split=split, image_id=image_id)
        with urllib.request.urlopen(url, timeout=30) as response:
            image = Image.open(BytesIO(response.read())).convert("RGB")
        image.thumbnail((MAX_SIDE, MAX_SIDE))
        image.save(path, quality=90)
        return True
    except Exception as error:
        print(f"  skipped {image_id}: {error}")
        return False


def build_split(name, sources, out, args, rng):
    """sources: [(open_images_split, csv_path), ...] merged into one YOLO split."""
    images_dir = out / "images" / name
    labels_dir = out / "labels" / name
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    jobs = []
    for oi_split, csv_path in sources:
        picked = pick_images(load_boxes(csv_path), args.lookalike_ratio, rng)
        if args.quick:
            picked = dict(list(picked.items())[:20])
        jobs += [(oi_split, image_id, lines) for image_id, lines in picked.items()]

    print(f"{name}: downloading {len(jobs)} images ...")
    with ThreadPoolExecutor(args.workers) as pool:
        results = pool.map(
            lambda job: save_image(job[0], job[1], images_dir / f"{job[1]}.jpg"), jobs
        )
        saved = 0
        for (oi_split, image_id, lines), ok in zip(jobs, results):
            if ok:
                (labels_dir / f"{image_id}.txt").write_text("\n".join(lines))
                saved += 1

    counts = defaultdict(int)
    for _, _, lines in jobs:
        for line in lines:
            counts[CLASS_NAMES[int(line.split()[0])]] += 1
        if not lines:
            counts["look-alike images"] += 1
    print(f"{name}: saved {saved} images; " + ", ".join(f"{k} {v}" for k, v in counts.items()))


def main():
    args = parse_args()
    out = Path(args.out)
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)

    def csv(split):
        return download(ANNOTATIONS[split], cache / f"{split}.csv")

    if args.quick:
        build_split("train", [("validation", csv("validation"))], out, args, rng)
        build_split("val", [("test", csv("test"))], out, args, rng)
    else:
        build_split("train", [("train", csv("train"))], out, args, rng)
        build_split("val", [("validation", csv("validation")), ("test", csv("test"))], out, args, rng)

    (out / "data.yaml").write_text(
        f"path: {out.resolve()}\n"
        "train: images/train\n"
        "val: images/val\n"
        "names:\n" + "".join(f"  {i}: {name}\n" for i, name in enumerate(CLASS_NAMES))
    )
    print(f"Dataset ready: {out / 'data.yaml'}")


if __name__ == "__main__":
    main()
