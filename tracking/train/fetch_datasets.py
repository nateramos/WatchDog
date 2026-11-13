"""Download public weapon datasets and convert them to the YOLO layout merge_datasets.py reads.

Everything lands under tracking/train/datasets/<name>/ as images/, labels/ and classes.txt,
with the original class names kept (merge_datasets.py maps them onto gun/knife later).

Sources (each is fetched only if its folder is not there yet, so reruns are cheap):
    granada_sohas    University of Granada "Weapons and similar handled objects": 5,859 frames
                     from YouTube and surveillance video. pistol, knife, smartphone, wallet,
                     banknote, card. Already in YOLO format. CC BY 4.0 (see the repo's License.md).
    granada_pistol   University of Granada pistol detection: 3,000 photos, Pascal VOC boxes.
    granada_knife    University of Granada knife detection: 2,078 photos, Pascal VOC boxes.
    seville_cctv     University of Seville "Real-time gun detection in CCTV": real surveillance
                     footage of a mock attack plus synthetic (Unity) images. CC BY-NC 4.0, so
                     research and demos only. Hosted on Hugging Face, which some networks block;
                     the Colab notebook fetches it there if this computer cannot.

The Granada sets come from GitHub with a sparse, blob-filtered clone, so only the folders
needed are downloaded (about 2 GB). Needs git and Python 3.8+ with Pillow; nothing else.

Usage:
    python fetch_datasets.py                      # everything
    python fetch_datasets.py --only granada_sohas granada_pistol
    python fetch_datasets.py --out D:/weapon_datasets
"""

import argparse
import shutil
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE / "datasets"
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

GRANADA_REPO = "https://github.com/ari-dasci/OD-WeaponDetection.git"
GRANADA_SETS = {
    # name: (folder in the repo, kind, image subfolder, label subfolder)
    "granada_sohas": (
        "Weapons and similar handled objects/Sohas_weapon-Detection-YOLOv5",
        "yolo",
        "obj_train_data/images",
        "obj_train_data/labels",
    ),
    "granada_pistol": ("Pistol detection", "voc", "Weapons", "xmls"),
    "granada_knife": ("Knife_detection", "voc", "Images", "annotations"),
}
SOHAS_CLASSES = ["pistol", "smartphone", "knife", "monedero", "billete", "tarjeta"]

SEVILLE_BASE = (
    "https://huggingface.co/datasets/jsalazar/"
    "US-Real-time-gun-detection-in-CCTV-An-open-problem-dataset/resolve/main/"
)
SEVILLE_FILES = ["weapons_images_2fps.zip", "Unity/split-2500.zip"]


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="where to put the datasets")
    parser.add_argument("--only", nargs="*", help="dataset names to fetch (default: all)")
    parser.add_argument("--keep-clone", action="store_true", help="keep the git clone after converting")
    return parser.parse_args()


def run(cmd, cwd=None):
    print("  $", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def images_in(folder):
    return sorted(p for p in Path(folder).rglob("*") if p.suffix.lower() in IMAGE_TYPES)


def image_size(path):
    from PIL import Image

    with Image.open(path) as img:
        return img.size


def voc_to_yolo(xml_path, width, height, classes):
    """Lines for one Pascal VOC file; class names are added to `classes` as they appear."""
    lines = []
    root = ET.parse(xml_path).getroot()
    size = root.find("size")
    if size is not None and size.findtext("width") and size.findtext("height"):
        w, h = float(size.findtext("width")), float(size.findtext("height"))
        if w > 0 and h > 0:
            width, height = w, h
    for obj in root.iter("object"):
        name = (obj.findtext("name") or "").strip().lower()
        box = obj.find("bndbox")
        if not name or box is None:
            continue
        try:
            x1, y1 = float(box.findtext("xmin")), float(box.findtext("ymin"))
            x2, y2 = float(box.findtext("xmax")), float(box.findtext("ymax"))
        except (TypeError, ValueError):
            continue
        x1, x2 = max(0.0, min(x1, x2)), min(width, max(x1, x2))
        y1, y2 = max(0.0, min(y1, y2)), min(height, max(y1, y2))
        if x2 - x1 < 1 or y2 - y1 < 1:
            continue
        if name not in classes:
            classes.append(name)
        lines.append(
            "{} {:.6f} {:.6f} {:.6f} {:.6f}".format(
                classes.index(name),
                (x1 + x2) / 2 / width,
                (y1 + y2) / 2 / height,
                (x2 - x1) / width,
                (y2 - y1) / height,
            )
        )
    return lines


def write_dataset(out, images, label_for, classes):
    """Copy images and write one YOLO label file each. label_for(image) -> list of lines."""
    (out / "images").mkdir(parents=True, exist_ok=True)
    (out / "labels").mkdir(parents=True, exist_ok=True)
    saved = boxes = 0
    for img in images:
        lines = label_for(img)
        if lines is None:
            continue
        dest = out / "images" / img.name
        if not dest.exists():
            shutil.copy2(img, dest)
        (out / "labels" / f"{img.stem}.txt").write_text("\n".join(lines))
        saved += 1
        boxes += len(lines)
    (out / "classes.txt").write_text("\n".join(classes) + "\n")
    print(f"  {out.name}: {saved} images, {boxes} boxes, classes {classes}")


def fetch_granada(names, out, keep_clone):
    clone = out / "_granada_clone"
    if not (clone / ".git").exists():
        shutil.rmtree(clone, ignore_errors=True)
        print("Cloning the Granada repository (only the folders needed) ...")
        run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", GRANADA_REPO, str(clone)])
    folders = [GRANADA_SETS[n][0] for n in names]
    run(["git", "sparse-checkout", "set", "--no-cone", "/License.md", "/README.md"] + ["/" + f for f in folders], cwd=clone)

    for name in names:
        folder, kind, img_dir, lbl_dir = GRANADA_SETS[name]
        dest = out / name
        if (dest / "classes.txt").exists():
            print(f"{name}: already converted, skipping")
            continue
        src = clone / folder
        images = images_in(src / img_dir)
        print(f"{name}: converting {len(images)} images ...")
        if kind == "yolo":
            classes = list(SOHAS_CLASSES)
            labels = {p.stem: p for p in (src / lbl_dir).rglob("*.txt")}

            def label_for(img, labels=labels):
                p = labels.get(img.stem)
                return p.read_text().split("\n") if p else []

            lines_clean = lambda ls: [l.strip() for l in ls if l.strip()]
            write_dataset(dest, images, lambda img: lines_clean(label_for(img)), classes)
        else:
            classes = []
            xmls = {p.stem: p for p in (src / lbl_dir).rglob("*.xml")}

            def label_for(img, xmls=xmls, classes=classes):
                p = xmls.get(img.stem)
                if not p:
                    return None  # no annotation file: leave the image out
                try:
                    w, h = image_size(img)
                except Exception:
                    return None
                return voc_to_yolo(p, w, h, classes)

            write_dataset(dest, images, label_for, classes)
        shutil.copy2(clone / "License.md", dest / "LICENSE.txt")
    if not keep_clone:
        shutil.rmtree(clone, ignore_errors=True)


def download(url, path):
    print(f"  downloading {url}")
    tmp = path.with_suffix(path.suffix + ".part")
    with urllib.request.urlopen(url, timeout=60) as response, open(tmp, "wb") as f:
        shutil.copyfileobj(response, f, 1 << 20)
    tmp.rename(path)


def convert_any(root, dest):
    """Best effort: YOLO txt next to images, else VOC xml, else COCO json, else no labels."""
    images = images_in(root)
    txts = {p.stem: p for p in root.rglob("*.txt") if p.name not in ("classes.txt", "train.txt", "val.txt", "test.txt")}
    xmls = {p.stem: p for p in root.rglob("*.xml")}
    jsons = [p for p in root.rglob("*.json")]
    classes = []
    names_file = next((p for p in root.rglob("classes.txt")), None) or next((p for p in root.rglob("obj.names")), None)
    if names_file:
        classes = [l.strip() for l in names_file.read_text().splitlines() if l.strip()]

    if xmls and len(xmls) >= len(txts):
        print(f"  {dest.name}: Pascal VOC labels")

        def label_for(img):
            p = xmls.get(img.stem)
            if not p:
                return None
            try:
                w, h = image_size(img)
            except Exception:
                return None
            return voc_to_yolo(p, w, h, classes)

    elif txts:
        print(f"  {dest.name}: YOLO labels")

        def label_for(img):
            p = txts.get(img.stem)
            return [l.strip() for l in p.read_text().split("\n") if l.strip()] if p else []

    elif jsons:
        import json

        print(f"  {dest.name}: COCO labels")
        by_file = {}
        for jp in jsons:
            try:
                data = json.loads(jp.read_text())
            except Exception:
                continue
            if not isinstance(data, dict) or "annotations" not in data:
                continue
            cats = {c["id"]: c["name"].lower() for c in data.get("categories", [])}
            for c in cats.values():
                if c not in classes:
                    classes.append(c)
            imgs = {i["id"]: i for i in data.get("images", [])}
            for a in data["annotations"]:
                info = imgs.get(a["image_id"])
                if not info:
                    continue
                x, y, w, h = a["bbox"]
                W, H = info["width"], info["height"]
                by_file.setdefault(Path(info["file_name"]).stem, []).append(
                    "{} {:.6f} {:.6f} {:.6f} {:.6f}".format(
                        classes.index(cats[a["category_id"]]), (x + w / 2) / W, (y + h / 2) / H, w / W, h / H
                    )
                )

        def label_for(img):
            return by_file.get(img.stem, [])

    else:
        print(f"  {dest.name}: no labels found; images kept as 'nothing here' examples")

        def label_for(img):
            return []

    write_dataset(dest, images, label_for, classes)


def fetch_seville(out):
    dest = out / "seville_cctv"
    if (dest / "classes.txt").exists():
        print("seville_cctv: already converted, skipping")
        return
    raw = out / "_seville_raw"
    raw.mkdir(parents=True, exist_ok=True)
    print("seville_cctv: downloading from Hugging Face ...")
    try:
        for name in SEVILLE_FILES:
            path = raw / Path(name).name
            if not path.exists():
                download(SEVILLE_BASE + name, path)
            folder = raw / path.stem
            if not folder.exists():
                print(f"  unzipping {path.name}")
                with zipfile.ZipFile(path) as z:
                    z.extractall(folder)
    except Exception as error:
        print(f"  could not download the Seville set from here ({error}).")
        print("  That is normal on networks that block huggingface.co; the Colab notebook fetches it instead.")
        return
    for sub in sorted(p for p in raw.iterdir() if p.is_dir()):
        convert_any(sub, dest / sub.name if len(SEVILLE_FILES) > 1 else dest)
    # Flatten: merge_datasets.py takes a folder with images/ and labels/, so give it each part.
    print("  Seville parts are under", dest)


def main():
    args = parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    wanted = args.only or list(GRANADA_SETS) + ["seville_cctv"]
    unknown = [n for n in wanted if n not in GRANADA_SETS and n != "seville_cctv"]
    if unknown:
        sys.exit(f"Unknown dataset(s): {unknown}. Choose from {list(GRANADA_SETS) + ['seville_cctv']}")

    granada = [n for n in wanted if n in GRANADA_SETS]
    if granada:
        fetch_granada(granada, out, args.keep_clone)
    if "seville_cctv" in wanted:
        fetch_seville(out)

    print("\nDone. Datasets in", out)
    for d in sorted(p for p in out.iterdir() if p.is_dir() and not p.name.startswith("_")):
        n = len(images_in(d / "images")) if (d / "images").exists() else sum(len(images_in(s / "images")) for s in d.iterdir() if (s / "images").exists())
        print(f"  {d.name}: {n} images")
    print("Next: python prep_dataset.py  (cleans and shrinks them), then merge_datasets.py or the notebook.")


if __name__ == "__main__":
    main()
