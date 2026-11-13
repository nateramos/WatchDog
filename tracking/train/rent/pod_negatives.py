"""Download look-alike photos (things that are NOT guns) to teach WatchDog what to ignore.

Why: the live feed flagged a ceiling fan (67-73%) and a dark object on the floor (71%). The
standard fix is "hard negatives": photos of objects that look like guns, added to training
with no boxes, so the model learns they are not guns. Research behind the choices:
  - Targeted look-alikes beat random empty scenes (SciTePress 2022 weapon detection used
    85% hard / 15% easy negatives).
  - Adding "hands holding everyday objects" cut false alarms 191 -> 11 (Olmos et al. 2017).
  - A CCTV pistol study added phones, purses, selfie sticks and bikes (MDPI 2022); the
    Sohas weapon set (Univ. Granada) adds phones, wallets, cards and bank notes for the same reason.
  - Ultralytics: background images cut false positives; keep them a minority of the set.
  - Frames the model actually got wrong (mined false positives) are worth the most.

Sources (both free to download, no account):
  1. Google Open Images V7, human-verified image labels, all ~20,000 categories (CC BY 2.0).
  2. COCO 2017 train (CC BY 4.0): umbrellas, phones, remotes, hair dryers, bats, rackets, ...
Any photo also tagged with a gun, rifle, pistol, weapon, knife, sword etc. is left out, so we
never teach the model that a real weapon is "nothing".

Output (on the fast local disk):
  /root/data/neg/images/train + labels/train   look-alikes for training (empty labels)
  /root/data/neg/images/test                   held-out look-alikes to count false alarms
Also picks up /workspace/mined/*.jpg (frames saved with "Not a gun" in the Live page).
"""
import csv
import io
import json
import random
import sys
import urllib.request
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps

OUT = Path("/root/data/neg")
TMP = Path("/workspace/neg_src")  # big label lists live on the roomy volume
MAX_SIDE = 1280
TEST_SHARE = 0.1
TOTAL_MAX = 55000  # ~20% of the 198k training set, the upper end of what guides suggest
random.seed(0)
CLASS = {}  # photo key -> category it was picked for

# Open Images categories -> how many photos at most. Names not in Open Images are skipped
# (the script prints them). Most categories have fewer photos than the cap.
OPEN_IMAGES = {
    # what the live feed got wrong: ceiling things, fixtures and dark floor objects
    "Ceiling fan": 4000, "Ceiling": 1500, "Chandelier": 1500, "Light fixture": 1500,
    "Lamp": 1000, "Lighting": 800, "Track lighting": 500, "Smoke detector": 500,
    "Air conditioning": 800, "Vacuum": 1500, "Vacuum cleaner": 1500, "Robotic vacuum cleaner": 800,
    "Home appliance": 800, "Space heater": 500, "Electric fan": 1500, "Mechanical fan": 1500,
    "Speaker": 800, "Loudspeaker": 800, "Subwoofer": 400, "Router": 400, "Projector": 600,
    "Security camera": 2000, "Closed-circuit television": 2000, "Surveillance camera": 2000, "Webcam": 800,
    "Thermostat": 400, "Light switch": 400, "Doorknob": 500, "Door handle": 800,
    # held like a gun / gun-shaped
    "Umbrella": 4000, "Camera": 3000, "Digital camera": 1500, "Camcorder": 1000, "Video camera": 1500,
    "Single-lens reflex camera": 1500, "Camera lens": 1000, "Mobile phone": 3000, "Smartphone": 3000,
    "Telephone": 800, "Corded phone": 500, "Remote control": 2000, "Game controller": 1500, "Joystick": 600,
    "Drill": 2000, "Power tool": 1500, "Hammer drill": 500, "Impact driver": 500, "Nail gun": 0,
    "Glue gun": 0, "Heat gun": 0, "Caulking gun": 0, "Spray gun": 0,   # 0 = never (named "gun")
    "Hair dryer": 2000, "Flashlight": 2000, "Torch": 800, "Hammer": 1500, "Screwdriver": 800,
    "Wrench": 800, "Pliers": 600, "Chainsaw": 800, "Saw": 800, "Tool": 1500, "Hand tool": 1000,
    "Tape measure": 400, "Stapler": 500, "Hole punch": 300, "Scissors": 1500, "Ruler": 400,
    "Pen": 800, "Marker pen": 400, "Spatula": 400, "Tongs": 400, "Ladle": 300,
    "Tripod": 1500, "Monopod": 400, "Selfie stick": 1000, "Binoculars": 1500, "Telescope": 800,
    "Microphone": 2000, "Computer mouse": 1000, "Calculator": 500, "Barcode scanner": 400,
    "Hand dryer": 300, "Shower head": 400, "Tap": 600, "Bicycle pump": 300, "Fire extinguisher": 600,
    "Crutch": 300, "Walking stick": 500, "Cane": 400, "Key": 600, "Wallet": 1000, "Credit card": 500,
    "Banknote": 500, "Toy": 1500,
    # long things carried at the side
    "Baseball bat": 1500, "Tennis racket": 1500, "Hockey stick": 600, "Golf club": 800,
    "Cricket bat": 600, "Guitar": 2000, "Electric guitar": 1000, "Bass guitar": 600, "Violin": 800,
    "Trumpet": 800, "Saxophone": 800, "Flute": 600, "Clarinet": 500, "Ski": 600, "Ski pole": 400,
    "Fishing rod": 800, "Broom": 600, "Mop": 400, "Shovel": 500, "Rake": 300,
    # bags and carried items
    "Handbag": 1500, "Backpack": 1500, "Briefcase": 600, "Bottle": 800, "Water bottle": 800,
    "Thermos": 300, "Bicycle": 800, "Skateboard": 800,
    # hands holding things (Olmos et al.)
    "Human hand": 5000, "Hand": 2000, "Finger": 1000, "Gesture": 1500, "Thumb": 600,
}
# More look-alikes (round 2), grouped by where a camera sees them.
OPEN_IMAGES.update({
    # ceiling and high on walls (seen at odd angles by CCTV)
    "Fire sprinkler": 500, "Sprinkler": 500, "Exit sign": 400, "Ventilation": 400, "Duct": 300,
    "Pipe": 800, "Beam": 400, "Wireless access point": 300, "Antenna": 400, "Hanging basket": 300,
    "Wall clock": 600, "Clock": 600, "Picture frame": 600, "Television": 800, "Shelf": 600,
    "Coat hanger": 400, "Hook": 400, "Bracket": 300, "Curtain": 500, "Blinds": 400,
    # dark objects on the floor (the 71% "vacuum" false alarm)
    "Footwear": 1500, "Shoe": 1500, "Boot": 1000, "Sneakers": 1000, "Slipper": 500, "Sandal": 500,
    "Glove": 600, "Cable": 600, "Extension cord": 300, "Power cord": 400, "Waste container": 600,
    "Bucket": 400, "Book": 800, "Cat": 1000, "Dog": 1000, "Video game console": 800,
    "Luggage and bags": 1000, "Suitcase": 800, "Tire": 400,
    # held in one hand, pointed or gripped like a pistol
    "Hair iron": 400, "Curling iron": 400, "Clothes iron": 500, "Iron": 500, "Electric razor": 400,
    "Hair clipper": 400, "Hairbrush": 400, "Comb": 300, "Toothbrush": 500, "Soldering iron": 300,
    "Spray bottle": 600, "Aerosol spray": 400, "Hose": 500, "Garden hose": 500, "Nozzle": 300,
    "Walkie-talkie": 600, "Two-way radio": 500, "Radio": 500, "Headphones": 800, "Earphones": 400,
    "Power bank": 300, "Charger": 400, "Portable media player": 300, "Tablet computer": 800,
    "E-book reader": 300, "Laser pointer": 200, "Label printer": 200, "Thermometer": 300,
    "Infrared thermometer": 300, "Multimeter": 300, "Drone": 600, "Gimbal": 300, "Joystick": 600,
    "Coffee cup": 600, "Mug": 600, "Can": 400, "Beer bottle": 400, "Vape": 300, "Cigarette": 300,
    "Lighter": 300, "Keychain": 300, "Car key": 300, "Sunglasses": 600, "Glasses": 600,
    "Ice cream": 300, "Hot dog": 300, "Banana": 600, "Cucumber": 300, "Carrot": 300,
    "Leaf blower": 400, "Hedge trimmer": 300, "String trimmer": 300, "Crowbar": 300, "Pipe wrench": 200,
    "Pickaxe": 0, "Frying pan": 500, "Kettle": 400, "Blender": 300, "Whisk": 300, "Rolling pin": 300,
    # long things held two-handed or slung (rifle/shotgun look-alikes)
    "Pool cue": 400, "Billiard cue": 400, "Lacrosse stick": 300, "Oar": 400, "Paddle": 400,
    "Trombone": 400, "Oboe": 200, "Recorder": 300, "Bassoon": 200, "Didgeridoo": 200,
    "Camera tripod": 400, "Microphone stand": 400, "Boom microphone": 300, "Light stand": 300,
    "Curtain rod": 200, "Stick": 500, "Pole": 500, "Rod": 300, "Plank": 300, "Ladder": 400,
    "Snowboard": 500, "Surfboard": 500, "Kayak": 300, "Scooter": 500, "Crutches": 300,
    "Telescope": 800, "Spotting scope": 200, "Rangefinder": 200, "Monocular": 200,
    # hand poses that read as "holding/pointing"
    "Pointing": 1000, "Finger gun": 0, "Thumbs up": 500, "Selfie": 1500, "Waving": 500,
})
# Any label containing one of these words bans the photo.
WEAPON_WORDS = ("gun", "rifle", "pistol", "revolver", "firearm", "weapon", "knife", "dagger", "sword",
                "machete", "bayonet", "ammunition", "cartridge", "bullet", "holster", "sniper",
                "carbine", "musket", "cannon", "trigger", "airsoft", "paintball", "military", "soldier",
                "police", "army", "armed", "hunting", "shooting", "blade", "axe", "grenade",
                "blaster", "nerf", "taser", "stun", "pepper spray", "baton", "crossbow", "archery",
                "bow and arrow", "tactical", "camouflage", "warfare", "combat", "missile", "armored")

# COCO categories -> cap. COCO has a "knife" class: photos with a knife are left out.
COCO = {"umbrella": 4000, "cell phone": 4000, "remote": 3000, "hair drier": 200, "scissors": 1500,
        "baseball bat": 2500, "tennis racket": 3000, "skateboard": 3000, "toothbrush": 1000,
        "handbag": 3000, "backpack": 3000, "bottle": 2000, "mouse": 1500, "laptop": 1000,
        "frisbee": 1000, "kite": 600, "skis": 1000, "surfboard": 600, "suitcase": 1000}

OI_FILES = [  # (class names, image labels), newest first
    ("https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions.csv",
     "https://storage.googleapis.com/openimages/v7/oidv7-train-annotations-human-imagelabels.csv"),
    ("https://storage.googleapis.com/openimages/v6/oidv6-class-descriptions.csv",
     "https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-human-imagelabels.csv"),
    ("https://storage.googleapis.com/openimages/v5/class-descriptions-boxable.csv",
     "https://storage.googleapis.com/openimages/v5/train-annotations-human-imagelabels-boxable.csv"),
]
COCO_ANN = "http://images.cocodataset.org/annotations/annotations_trainval2017.zip"


def fetch(url):
    TMP.mkdir(parents=True, exist_ok=True)
    path = TMP / url.rsplit("/", 1)[1]
    if not path.exists():
        print("Downloading", path.name, "...", flush=True)
        urllib.request.urlretrieve(url, str(path) + ".part")
        Path(str(path) + ".part").rename(path)
    return path


def is_weapon(name):
    n = name.lower()
    return any(w in n for w in WEAPON_WORDS)


def pick_open_images():
    for names_url, labels_url in OI_FILES:
        try:
            names_path, labels_path = fetch(names_url), fetch(labels_url)
            break
        except Exception as e:
            print("  not available:", names_url, e)
    else:
        print("Open Images: could not download the label lists; skipping.")
        return {}
    names = {}
    with open(names_path, newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if len(row) >= 2 and row[0] != "LabelName":
                names[row[0]] = row[1]
    by_name = {v.lower(): k for k, v in names.items()}
    missing = [n for n, c in OPEN_IMAGES.items() if c and n.lower() not in by_name]
    if missing:
        print("Not in Open Images (skipped):", ", ".join(missing))
    want = {by_name[n.lower()]: n for n, c in OPEN_IMAGES.items() if c and n.lower() in by_name and not is_weapon(n)}
    bad = {mid for mid, n in names.items() if is_weapon(n)}
    print(f"Open Images: {len(want)} look-alike categories, {len(bad)} weapon-like categories to avoid")

    per_class = defaultdict(list)
    banned = set()
    print("Reading Open Images labels (a few minutes) ...", flush=True)
    with open(labels_path, newline="") as f:
        for row in csv.DictReader(f):
            if row["Confidence"] != "1":
                continue
            if row["LabelName"] in bad:
                banned.add(row["ImageID"])
            elif row["LabelName"] in want:
                per_class[want[row["LabelName"]]].append(row["ImageID"])

    chosen = {}
    for name, ids in sorted(per_class.items()):
        ids = [i for i in dict.fromkeys(ids) if i not in banned and f"oi_{i}" not in chosen]
        random.shuffle(ids)
        take = ids[: OPEN_IMAGES[name]]
        for i in take:
            chosen[f"oi_{i}"] = f"https://open-images-dataset.s3.amazonaws.com/train/{i}.jpg"
            CLASS[f"oi_{i}"] = name
        print(f"  {name:<28} {len(take):>5} of {len(ids)} available")
    print(f"Open Images: {len(chosen)} photos; left out {len(banned)} that show something weapon-like.")
    return chosen


def pick_coco():
    try:
        z = zipfile.ZipFile(fetch(COCO_ANN))
        data = json.loads(z.read("annotations/instances_train2017.json"))
    except Exception as e:
        print("COCO: could not download the labels; skipping.", e)
        return {}
    cats = {c["id"]: c["name"] for c in data["categories"]}
    files = {im["id"]: im["file_name"] for im in data["images"]}
    per_class = defaultdict(set)
    banned = set()
    for a in data["annotations"]:
        name = cats[a["category_id"]]
        if name == "knife":
            banned.add(a["image_id"])
        elif COCO.get(name):
            per_class[name].add(a["image_id"])
    chosen = {}
    for name, ids in sorted(per_class.items()):
        ids = [i for i in sorted(ids) if i not in banned and f"coco_{i}" not in chosen]
        random.shuffle(ids)
        take = ids[: COCO[name]]
        for i in take:
            chosen[f"coco_{i}"] = f"http://images.cocodataset.org/train2017/{files[i]}"
            CLASS[f"coco_{i}"] = "coco " + name
        print(f"  COCO {name:<23} {len(take):>5} of {len(ids)} available")
    print(f"COCO: {len(chosen)} photos (left out {len(banned)} with a knife).")
    return chosen


def download(job):
    key, url, split = job
    dst = OUT / "images" / split / f"{key}.jpg"
    if dst.exists():
        return True
    for _ in range(3):
        try:
            data = urllib.request.urlopen(url, timeout=30).read()
            im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
            im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
            im.save(dst, "JPEG", quality=90)
            return True
        except Exception:
            continue
    return False


def main():
    chosen = {**pick_open_images(), **pick_coco()}
    keys = list(chosen)
    random.shuffle(keys)
    if len(keys) > TOTAL_MAX:
        # Keep every photo of the rare categories; trim only the biggest ones down to a shared
        # ceiling (hands, toys, COCO phones...) until the total fits.
        groups = defaultdict(list)
        for k in keys:
            groups[CLASS[k]].append(k)
        lo, hi = 1, max(len(v) for v in groups.values())
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if sum(min(len(v), mid) for v in groups.values()) <= TOTAL_MAX:
                lo = mid
            else:
                hi = mid - 1
        keys = [k for v in groups.values() for k in v[:lo]]
        random.shuffle(keys)
        print(f"Found {len(chosen)}; kept all of every category up to {lo} photos each -> {len(keys)} total.")
    n_test = int(len(keys) * TEST_SHARE)
    jobs = [(k, chosen[k], "test" if n < n_test else "train") for n, k in enumerate(keys)]
    for split in ("train", "test"):
        (OUT / "images" / split).mkdir(parents=True, exist_ok=True)
    (OUT / "labels" / "train").mkdir(parents=True, exist_ok=True)

    # Remove photos from an earlier run that are no longer picked (or switched train/test).
    wanted = {(k, sp) for k, _, sp in jobs}
    removed = 0
    for sp in ("train", "test"):
        for p in (OUT / "images" / sp).glob("*.jpg"):
            if not p.stem.startswith("mined_") and (p.stem, sp) not in wanted:
                p.unlink()
                removed += 1
    if removed:
        print(f"Removed {removed} photos from an earlier run that are no longer picked.")
    print(f"Downloading {len(jobs)} photos ...", flush=True)
    ok = 0
    with ThreadPoolExecutor(96) as pool:
        for n, good in enumerate(pool.map(download, jobs), 1):
            ok += good
            if n % 2000 == 0:
                print(f"  {n}/{len(jobs)}", flush=True)
    print(f"Got {ok} of {len(jobs)}.")

    # Frames the user marked "Not a gun" in the Live page: the most valuable negatives.
    mined = sorted(Path("/workspace/mined").glob("*.jpg")) if Path("/workspace/mined").exists() else []
    for p in mined:
        im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        im.save(OUT / "images" / "train" / f"mined_{p.stem}.jpg", "JPEG", quality=90)
    print(f"Added {len(mined)} frames from the Live page.")

    # Empty label files = "nothing to find in this photo".
    train = sorted((OUT / "images" / "train").glob("*.jpg"))
    for p in train:
        (OUT / "labels" / "train" / (p.stem + ".txt")).touch()
    lines = []
    for p in train:
        lines += [str(p)] * (10 if p.name.startswith("mined_") else 1)  # show mined frames 10x
    (OUT / "train.txt").write_text("\n".join(lines) + "\n")
    print(f"DONE: {len(train)} training look-alikes, {len(list((OUT / 'images' / 'test').glob('*.jpg')))} held out for testing.")


if __name__ == "__main__":
    sys.exit(main())
