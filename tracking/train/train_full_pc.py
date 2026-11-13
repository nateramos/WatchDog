"""WatchDog: download every public weapon dataset, merge and clean them, and train the browser
model on this computer's GPU. For Model Dublin it was run with WATCHDOG_STAGE=data, which only
builds the dataset; training then ran on a rented GPU (see rent/ and README.md).

Everything is stored under
C:\\watchdog_data (set WATCHDOG_DATA to change it): about 25 GB for downloads plus the dataset.
If it is stopped, run it again: downloads are skipped and training resumes from the last pass.
"""
import os
import os, re, json, random, shutil, zipfile, hashlib, xml.etree.ElementTree as ET
from pathlib import Path
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageOps, ImageFilter
import numpy as np
import imagehash
import torch
from ultralytics import YOLO
import ultralytics.engine.trainer as _tr
import onnxruntime as ort
STAGE = os.environ.get("WATCHDOG_STAGE", "all")   # "data" = only build the dataset


def main():
    # ---- Settings -------------------------------------------------------------------------
    COMMERCIAL = False          # True: only datasets whose license allows commercial use
    MODEL = "yolo11m.pt"        # YOLO11 medium: best accuracy for the time on a 12 GB card; same output format
    IMGSZ = 640                 # the browser demo feeds the model 640x640
    EPOCHS = 20                 # upper limit (~2.4 h each); training stops by itself once it stops improving
    PATIENCE = 6                # ...after this many passes without improvement
    TRAIN_HOURS = None          # no time limit on your own PC; EPOCHS decides
    CCTV_LOOK_SHARE = 0.35      # share of non-CCTV training images given a degraded CCTV-style copy
    VAL_SHARE = 0.08
    SEED = 0

    ROOT = os.environ.get("WATCHDOG_DATA", r"C:\watchdog_data")
    WORK = os.path.join(ROOT, "work")
    RAW = os.path.join(ROOT, "raw")         # downloads, kept so reruns skip them
    DATA = os.path.join(ROOT, "dataset")    # the merged training set

    random.seed(SEED)
    for d in (RAW, DATA, WORK):
        Path(d).mkdir(parents=True, exist_ok=True)
    IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    SOURCES = {}   # name -> {"root": Path, "cctv": bool, "license": str}

    def export_model():

        best = YOLO(f"{WORK}/runs/weapons/weights/best.pt")
        metrics = best.val(data=f"{DATA}/data.yaml", imgsz=IMGSZ, split="val")
        print("mAP50 gun:", metrics.box.ap50[0], " mAP50-95 gun:", metrics.box.maps[0])
        onnx = best.export(format="onnx", imgsz=IMGSZ, batch=1, dynamic=False, simplify=True)
        shutil.copy(onnx, f"{WORK}/weapons.onnx")
        shutil.copy(f"{WORK}/runs/weapons/weights/best.pt", f"{WORK}/weapons.pt")

        # Same output shape as the model the browser already reads: (1, 6, 8400).
        s = ort.InferenceSession(f"{WORK}/weapons.onnx")
        out = s.run(None, {s.get_inputs()[0].name: np.zeros((1, 3, IMGSZ, IMGSZ), np.float32)})[0]
        print("ONNX output shape:", out.shape)
        assert out.shape == (1, 6, 8400), "unexpected output shape: the browser decoder expects (1, 6, 8400)"
        dest = Path(__file__).resolve().parents[2] / "public" / "models" / "weapons_new.onnx"
        shutil.copy(f"{WORK}/weapons.onnx", dest)
        print(f"Done. New model saved as {dest}. Test it, then rename it to weapons.onnx to use it in the demo.")

    # Crashed or stopped during training? Go straight back to it: the dataset is already built.
    last = Path(f"{WORK}/runs/weapons/weights/last.pt")
    if STAGE == "all" and last.exists() and Path(f"{DATA}/data.yaml").exists():
        print("Resuming training from the last saved pass:", last)
        import ultralytics.engine.trainer as _tr0
        _tr0.check_amp = lambda *a, **k: True
        try:
            YOLO(str(last)).train(resume=True)
        except AssertionError as e:   # Ultralytics refuses to resume a run that already finished
            print("Training had already finished:", e)
        export_model()
        return

    print('\n=== 1. Download ===')

    FAILED = []

    def retry(fn, tries=3):
        import time
        for i in range(tries):
            try:
                return fn()
            except Exception as e:
                if i == tries - 1:
                    raise
                print(f"    retrying in 30 s ({e})")
                time.sleep(30)

    def add_source(name, root, cctv, license):
        SOURCES[name] = {"root": Path(root), "cctv": cctv, "license": license}
        n = sum(1 for p in Path(root).rglob("*") if p.suffix.lower() in IMAGE_TYPES)
        print(f"  + {name}: {n} images ({license}{', CCTV' if cctv else ''})")

    # Weapons-130K: 130k images, YOLO, 7 classes (Firearm, Melee_Weapon, Blunt_Weapon, Explosive,
    # Fire_Smoke, Person, Tool), ~12k background frames. CC BY 4.0. Built into Kaggle.
    try:
        import kagglehub
        path = retry(lambda: kagglehub.dataset_download("haiderkhan6410/weapons-130k"))
        add_source("weapons130k", path, cctv=False, license="CC BY 4.0")
    except Exception as e:
        print("  ! weapons130k failed:", e); FAILED.append("weapons130k")

    # Roboflow Universe datasets (YOLOv8 export). (workspace, project, cctv?, license, commercial ok?)
    ROBOFLOW = [
        ("nayyabs-workspace-f5p0n", "fyp-weapon-detection-in-cctv-08hbn", True,  "CC BY 4.0", True),
        ("team-work-30yc0",         "detectando-armas",                   False, "CC BY 4.0", True),
        ("mgddegradao",             "mgd-bed0h",                          False, "CC BY 4.0", True),
        ("mohammadreza-anvari-h6ase", "cctv-gun-detector",                True,  "CC BY 4.0", True),
        ("arms",                    "the-monash-guns-dataset",            True,  "CC BY 4.0", True),
        # YOLOv12 WeaponDetection: 26.5k frames from 1,200+ videos incl. CCTV, plus a "no gun" set.
        ("gundetectiondataset",     "weapondataset-oi2g3",                True,  "research only", False),
        ("gundetectiondataset",     "nogun",                              True,  "research only", False),
    ]
    rf_key = os.environ.get("ROBOFLOW_API_KEY")
    if not rf_key:
        print("  ! No ROBOFLOW_API_KEY secret: skipping Roboflow datasets (see the first cell).")
    else:
        from roboflow import Roboflow
        rf = Roboflow(api_key=rf_key)
        for ws, proj, cctv, lic, commercial_ok in ROBOFLOW:
            if COMMERCIAL and not commercial_ok:
                print(f"  - {proj}: skipped (research only)")
                continue
            try:
                project = rf.workspace(ws).project(proj)
                versions = sorted(project.versions(), key=lambda v: int(str(v.version).split("/")[-1]))
                v = versions[-1]
                out = f"{RAW}/rf_{proj}"
                if not Path(out).exists():
                    retry(lambda: v.download("yolov8", location=out))
                add_source(f"rf_{proj}", out, cctv=cctv, license=lic)
            except Exception as e:
                print(f"  ! {proj} failed:", e); FAILED.append(proj)

    # University of Seville: real CCTV mock attack + Unity synthetic. CC BY-NC 4.0 (research only).
    if not COMMERCIAL:
        try:
            from huggingface_hub import hf_hub_download
            repo = "jsalazar/US-Real-time-gun-detection-in-CCTV-An-open-problem-dataset"
            for fname, name, cctv in [("weapons_images_2fps.zip", "seville_cctv", True),
                                      ("Unity/split-2500.zip", "seville_synthetic", False)]:
                z = retry(lambda: hf_hub_download(repo, fname, repo_type="dataset", local_dir=f"{RAW}/hf"))
                out = f"{RAW}/{name}"
                if not Path(out).exists():
                    with zipfile.ZipFile(z) as f:
                        f.extractall(out)
                add_source(name, out, cctv=cctv, license="CC BY-NC 4.0")
        except Exception as e:
            print("  ! seville failed:", e); FAILED.append("seville")

    # University of Granada: Sohas (YOLO, 5.9k frames incl. surveillance), pistols, knives. CC BY 4.0.
    try:
        g = f"{RAW}/granada"
        if not Path(g).exists():
            import subprocess
            subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse",
                            "https://github.com/ari-dasci/OD-WeaponDetection.git", g], check=True)
            subprocess.run(["git", "sparse-checkout", "set", "--no-cone",
                            "/Weapons and similar handled objects/Sohas_weapon-Detection-YOLOv5",
                            "/Pistol detection", "/Knife_detection"], cwd=g, check=True)
        add_source("granada_sohas", f"{g}/Weapons and similar handled objects/Sohas_weapon-Detection-YOLOv5", cctv=False, license="CC BY 4.0")
        add_source("granada_pistol", f"{g}/Pistol detection", cctv=False, license="CC BY 4.0")
        add_source("granada_knife", f"{g}/Knife_detection", cctv=False, license="CC BY 4.0")
    except Exception as e:
        print("  ! granada failed:", e); FAILED.append("granada")

    # Open Images (Google): handguns, rifles, shotguns, knives, plus look-alike photos with no weapon
    # (drills, tripods, phones, instruments, umbrellas...). Built by prepare_weapon_data.py.
    try:
        oi = f"{RAW}/openimages"
        if not Path(f"{oi}/data.yaml").exists():
            import subprocess, sys
            subprocess.run([sys.executable, str(Path(__file__).with_name("prepare_weapon_data.py")),
                            "--out", oi, "--cache", f"{RAW}/openimages_cache"], check=True)
        add_source("openimages", oi, cctv=False, license="CC BY 4.0 annotations, CC BY 2.0 images")
    except Exception as e:
        print("  ! openimages failed:", e); FAILED.append("openimages")

    # YouTube-GDD: ~5,000 frames from 343 YouTube videos, gun + person boxes, Apache-2.0.
    # Labels come from the GitHub repo; the images from a Google Drive copy shared by a user
    # (the original YouTube links are mostly dead). Optional: if the Drive link fails, the run
    # continues without it instead of stopping.
    try:
        yg = Path(f"{RAW}/youtube_gdd")
        clean = yg / "clean"
        if not (clean / "classes.txt").exists():
            import subprocess, sys
            yg.mkdir(parents=True, exist_ok=True)
            if not (yg / "repo").exists():
                subprocess.run(["git", "clone", "-q", "--depth", "1",
                                "https://github.com/UCAS-GYX/YouTube-GDD.git", str(yg / "repo")], check=True)
            for z in ("labels.zip", "YouTube-GDD_test_labels.zip"):
                if (yg / "repo" / z).exists():
                    with zipfile.ZipFile(yg / "repo" / z) as f:
                        f.extractall(yg / "labels_raw")
            imgzip = yg / "images.zip"
            if not imgzip.exists():
                subprocess.run([sys.executable, "-m", "pip", "install", "-q", "gdown"], check=True)
                import gdown
                retry(lambda: gdown.download(id="1TH6kSx7WoFRrUPbxcDGYBrFrYUI1ReWa", output=str(imgzip), quiet=False))
            if not (yg / "images_raw").exists():
                with zipfile.ZipFile(imgzip) as f:
                    f.extractall(yg / "images_raw")
            labels = {p.stem: p for p in (yg / "labels_raw").rglob("*.txt") if p.name != "classes.txt"}
            (clean / "images").mkdir(parents=True, exist_ok=True)
            (clean / "labels").mkdir(parents=True, exist_ok=True)
            n = 0
            for img in (yg / "images_raw").rglob("*"):
                if img.suffix.lower() in IMAGE_TYPES and img.stem in labels:
                    shutil.copy(img, clean / "images" / img.name)
                    shutil.copy(labels[img.stem], clean / "labels" / (img.stem + ".txt"))
                    n += 1
            if n == 0:
                raise RuntimeError("no images matched the labels")
            (clean / "classes.txt").write_text("person\ngun\n")
        add_source("youtube_gdd", clean, cctv=False, license="Apache-2.0")
    except Exception as e:
        print("  ! youtube_gdd skipped (optional):", e)

    print("\nSources:", ", ".join(SOURCES))
    if FAILED and not os.environ.get("WATCHDOG_ALLOW_MISSING"):
        raise SystemExit(
            f"\nThese downloads failed: {', '.join(FAILED)}.\n"
            "Nothing is lost: check the internet connection and run train_full_pc.ps1 again; finished\n"
            "downloads are skipped. (To train without them anyway, set WATCHDOG_ALLOW_MISSING=1.)")

    print('\n=== 2. Read and map classes ===')

    GUN = {"gun", "guns", "firearm", "pistol", "pistols", "handgun", "handguns", "rifle", "rifles",
           "shotgun", "shotguns", "long_gun", "long guns", "long gun", "heavy gun", "heavyweapon",
           "larga", "corta", "arma", "armas", "revolver", "weapon_gun", "guns perspective", "machine gun"}
    KNIFE = {"knife", "knives", "knife_weapon", "knife_deploy", "dagger", "blade", "cuchillo"}
    OTHER_WEAPON = {"melee_weapon", "blunt_weapon", "explosive", "sword", "grenade", "missile",
                    "weapon", "weapons", "armed man", "armed", "bat"}  # ambiguous: image is dropped
    # Labels known to be harmless. Any OTHER unrecognized label (e.g. FYP's junk class names like
    # "1_set - v1 ...") might secretly be a gun, so an image whose only boxes are unrecognized
    # is left out rather than taught as "no gun here".
    SAFE = {"person", "man", "people", "unarmed", "tool", "fire_smoke", "smartphone", "monedero",
            "billete", "tarjeta", "nogun", "no_weapon", "other", "victim", "hand"}

    def norm(name):
        return re.sub(r"\s+", " ", str(name).strip().lower())

    def class_names(root):
        """Class list from data.yaml / dataset.yaml / classes.txt under root."""
        import yaml
        for y in list(Path(root).rglob("data.yaml")) + list(Path(root).rglob("dataset.yaml")):
            try:
                d = yaml.safe_load(y.read_text())
                names = d.get("names")
                if isinstance(names, dict):
                    names = [names[k] for k in sorted(names, key=int)]
                if names:
                    return [norm(n) for n in names]
            except Exception:
                pass
        for c in list(Path(root).rglob("classes.txt")) + list(Path(root).rglob("obj.names")):
            return [norm(l) for l in c.read_text().splitlines() if l.strip()]
        return []

    def label_path(img):
        """YOLO label next to an image: .../images/x.jpg -> .../labels/x.txt (or same folder)."""
        parts = list(img.parts)
        for i in range(len(parts) - 1, -1, -1):
            if parts[i] == "images":
                parts[i] = "labels"
                p = Path(*parts).with_suffix(".txt")
                if p.exists():
                    return p
        p = img.with_suffix(".txt")
        return p if p.exists() else None

    def voc_boxes(xml_path):
        root = ET.parse(xml_path).getroot()
        W = float(root.findtext("size/width") or 0); H = float(root.findtext("size/height") or 0)
        out = []
        for o in root.iter("object"):
            b = o.find("bndbox")
            if b is None: continue
            try:
                x1, y1, x2, y2 = (float(b.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax"))
            except Exception:
                continue
            out.append((norm(o.findtext("name")), x1, y1, x2, y2, W, H))
        return out

    def read_source(name, info):
        """Yields (image_path, [(cls, cx, cy, w, h)], drop_reason or None)."""
        root = info["root"]
        names = class_names(root)
        xmls = {p.stem: p for p in root.rglob("*.xml")}
        for img in root.rglob("*"):
            if img.suffix.lower() not in IMAGE_TYPES:
                continue
            raw = []  # (classname, cx, cy, w, h) normalized
            lp = label_path(img)
            if lp is not None:
                for line in lp.read_text(errors="ignore").splitlines():
                    p = line.split()
                    if len(p) < 5: continue
                    try:
                        c = int(float(p[0])); cx, cy, w, h = map(float, p[1:5])
                    except ValueError:
                        continue
                    cname = names[c] if 0 <= c < len(names) else f"class{c}"
                    raw.append((cname, cx, cy, w, h))
            elif img.stem in xmls:
                boxes = voc_boxes(xmls[img.stem])
                if boxes and not all(b[5] and b[6] for b in boxes):
                    with Image.open(img) as im:
                        W, H = im.size
                    boxes = [(b[0], b[1], b[2], b[3], b[4], W, H) for b in boxes]
                for cname, x1, y1, x2, y2, W, H in boxes:
                    raw.append((cname, (x1 + x2) / 2 / W, (y1 + y2) / 2 / H, (x2 - x1) / W, (y2 - y1) / H))
            out, other, unknown = [], False, False
            for cname, cx, cy, w, h in raw:
                if cname in GUN: out.append((0, cx, cy, w, h))
                elif cname in KNIFE: out.append((1, cx, cy, w, h))
                elif cname in OTHER_WEAPON: other = True
                elif cname not in SAFE: unknown = True
            if other and not out:
                yield img, [], "other weapon only"
            elif unknown and not out:
                yield img, [], "unrecognized labels only"
            else:
                yield img, out, None

    ITEMS, DROPPED, UNMAPPED = [], Counter(), Counter()
    for name, info in SOURCES.items():
        n0 = len(ITEMS)
        for img, boxes, reason in read_source(name, info):
            if reason:
                DROPPED[(name, reason)] += 1
                continue
            ITEMS.append({"src": name, "img": img, "boxes": boxes, "cctv": info["cctv"]})
        got = ITEMS[n0:]
        # A weapon dataset whose labels could not be read would teach the model that guns are
        # background. Only the deliberate "no gun" set may have no weapon boxes at all.
        if len(got) > 50 and not any(it["boxes"] for it in got) and "nogun" not in name:
            print(f"  ! {name}: {len(got)} images but no gun/knife boxes could be read; leaving it out")
            del ITEMS[n0:]
            continue
        guns = sum(sum(1 for b in it["boxes"] if b[0] == 0) for it in got)
        knives = sum(sum(1 for b in it["boxes"] if b[0] == 1) for it in got)
        empty = sum(1 for it in got if not it["boxes"])
        print(f"{name:28s} {len(got):7d} images  {guns:7d} gun boxes  {knives:6d} knife boxes  {empty:6d} no-weapon")
        print(f"{'':28s} classes: {class_names(info['root'])[:12]}")
    print("Dropped:", dict(DROPPED))
    print("Total:", len(ITEMS))

    print('\n=== 3. Remove duplicates ===')

    def phash(it):
        try:
            with Image.open(it["img"]) as im:
                return str(imagehash.phash(ImageOps.exif_transpose(im).convert("L"), hash_size=8))
        except Exception:
            return None

    with ThreadPoolExecutor(8) as pool:
        hashes = list(pool.map(phash, ITEMS))
    best = {}
    bad = 0
    for it, h in zip(ITEMS, hashes):
        if h is None:
            bad += 1; continue
        it["hash"] = h
        if h not in best or len(it["boxes"]) > len(best[h]["boxes"]):
            best[h] = it
    before = len(ITEMS)
    ITEMS = list(best.values())
    print(f"{before} -> {len(ITEMS)} unique images ({before - len(ITEMS) - bad} duplicates, {bad} unreadable)")
    print("Per source after de-dup:", Counter(it["src"] for it in ITEMS).most_common())

    print('\n=== 4. Write the training set ===')

    def cctv_look(im):
        w, h = im.size
        s = random.uniform(0.25, 0.55)                       # low-resolution camera
        im = im.resize((max(32, int(w * s)), max(32, int(h * s))), Image.BILINEAR).resize((w, h), Image.BILINEAR)
        if random.random() < 0.5:
            im = im.filter(ImageFilter.GaussianBlur(random.uniform(0.4, 1.4)))
        a = np.asarray(im).astype(np.float32)
        a *= random.uniform(0.55, 1.05)                      # dim hallways
        a += np.random.normal(0, random.uniform(3, 12), a.shape)
        a = np.clip(a, 0, 255).astype(np.uint8)
        im = Image.fromarray(a)
        r = random.random()
        if r < 0.25:
            im = ImageOps.grayscale(im).convert("RGB")       # black-and-white camera
        elif r < 0.35:
            g = np.asarray(ImageOps.grayscale(im)).astype(np.float32)
            im = Image.fromarray(np.stack([g * 0.75, g, g * 0.75], -1).clip(0, 255).astype(np.uint8))  # IR night
        return im, random.randint(18, 45)                    # JPEG quality

    shutil.rmtree(DATA, ignore_errors=True)
    for split in ("train", "val"):
        for k in ("images", "labels"):
            Path(f"{DATA}/{k}/{split}").mkdir(parents=True, exist_ok=True)

    random.shuffle(ITEMS)
    n_val = int(len(ITEMS) * VAL_SHARE)
    for i, it in enumerate(ITEMS):
        it["split"] = "val" if i < n_val else "train"

    def write(it):
        try:
            with Image.open(it["img"]) as im:
                im = ImageOps.exif_transpose(im).convert("RGB")
                if max(im.size) > 800:
                    s = 800 / max(im.size)
                    im = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)
                stem = f'{it["src"]}_{it["hash"]}'
                lines = []
                for c, cx, cy, w, h in it["boxes"]:
                    x1, y1 = max(0, cx - w / 2), max(0, cy - h / 2)
                    x2, y2 = min(1, cx + w / 2), min(1, cy + h / 2)
                    if (x2 - x1) * im.size[0] >= 2 and (y2 - y1) * im.size[1] >= 2:
                        lines.append(f"{c} {(x1+x2)/2:.6f} {(y1+y2)/2:.6f} {x2-x1:.6f} {y2-y1:.6f}")
                sp = it["split"]
                im.save(f"{DATA}/images/{sp}/{stem}.jpg", quality=92)
                Path(f"{DATA}/labels/{sp}/{stem}.txt").write_text("\n".join(lines))
                n = 1
                if sp == "train" and not it["cctv"] and random.random() < CCTV_LOOK_SHARE:
                    im2, q = cctv_look(im)
                    im2.save(f"{DATA}/images/train/{stem}_cctv.jpg", quality=q)
                    Path(f"{DATA}/labels/train/{stem}_cctv.txt").write_text("\n".join(lines))
                    n = 2
                return n
        except Exception:
            return 0

    with ThreadPoolExecutor(8) as pool:
        written = list(pool.map(write, ITEMS))
    print(f"Wrote {sum(written)} images ({sum(1 for w in written if w == 2)} CCTV-style copies)")

    # Real CCTV images are what matters most, so list them twice in the training list.
    train_imgs = sorted(Path(f"{DATA}/images/train").glob("*.jpg"))
    cctv_srcs = {n for n, s in SOURCES.items() if s["cctv"]}
    lines = []
    for p in train_imgs:
        lines.append(str(p))
        if any(p.name.startswith(s + "_") for s in cctv_srcs):
            lines += [str(p)] * 1
    Path(f"{DATA}/train.txt").write_text("\n".join(lines))
    Path(f"{DATA}/data.yaml").write_text(
        f"path: {DATA}\ntrain: train.txt\nval: images/val\nnames:\n  0: gun\n  1: knife\n")
    print(f"Training list: {len(lines)} entries ({len(train_imgs)} files)")
    json.dump({n: {"license": s["license"], "cctv": s["cctv"]} for n, s in SOURCES.items()},
              open(f"{WORK}/dataset_sources.json", "w"), indent=1)

    if STAGE == 'data':
        raise SystemExit('Dataset built; skipping training (WATCHDOG_STAGE=data).')

    print('\n=== 5. Train ===')

    devices = 0 if torch.cuda.is_available() else "cpu"
    print("GPUs:", devices)
    # AMD + Windows: Ultralytics' half-precision self-test fails falsely on this setup, but the
    # speed test showed half precision trains fine and is ~3x faster, so skip the self-test.
    _tr.check_amp = lambda *a, **k: True
    last = Path(f"{WORK}/runs/weapons/weights/last.pt")
    if last.exists():
        print("Resuming the previous run from", last)
        model = YOLO(str(last))
        model.train(resume=True)
        raise SystemExit
    model = YOLO(MODEL)
    model.train(
        data=f"{DATA}/data.yaml",
        imgsz=IMGSZ,
        epochs=EPOCHS,
        amp=True,
        deterministic=False,
        save_period=1,
        patience=PATIENCE,
        batch=16 if devices != "cpu" else 8,   # 16 fits the 12 GB card; 24 was slower
        device=devices,
        workers=8,
        cache=False,
        scale=0.7,            # strong size changes: small, distant guns
        degrees=10,
        flipud=0.0,
        hsv_v=0.6,
        mosaic=1.0,
        close_mosaic=5,
        project=f"{WORK}/runs",
        name="weapons",
        exist_ok=True,
        seed=SEED,
    )

    print('\n=== 6. Export ===')
    export_model()


# Windows starts training workers by re-importing this file, so all work happens in main().
if __name__ == "__main__":
    main()
