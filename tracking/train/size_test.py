"""WatchDog: does 1280px training help? Two quick checks on this PC (about 15-25 minutes).

1. Measures the real size of a sample of your training images (no GPU, ~1 minute).
2. Runs the PC model's best weights (best.pt from the 640px run) on 2,000 validation images
   at 640 and at 1280, and compares the scores. Reads files only; changes nothing.
"""
import os, random, sys
from pathlib import Path
import yaml
from PIL import Image

ROOT = Path(os.environ.get("WATCHDOG_DATA", r"C:\watchdog_data"))
DATA_YAML = ROOT / "dataset" / "data.yaml"
BEST = ROOT / "work" / "runs" / "weapons" / "weights" / "best.pt"
TMP = ROOT / "work" / "size_test"
IMG_TYPES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

def main():
    random.seed(0)

    cfg = yaml.safe_load(open(DATA_YAML))
    base = Path(cfg.get("path", DATA_YAML.parent))
    def images(split):
        p = Path(cfg[split]); p = p if p.is_absolute() else base / p
        if p.suffix == ".txt":
            return [Path(l.strip()) for l in open(p) if l.strip()]
        return [f for f in p.rglob("*") if f.suffix.lower() in IMG_TYPES]

    # ---- 1. Image sizes -----------------------------------------------------------------------
    print("\n=== 1. How big are your training images? ===")
    train = images("train")
    sample = random.sample(train, min(3000, len(train)))
    small = mid = big = 0
    sides = []
    for f in sample:
        try:
            w, h = Image.open(f).size
        except Exception:
            continue
        s = max(w, h); sides.append(s)
        if s < 640: small += 1
        elif s < 1280: mid += 1
        else: big += 1
    n = len(sides); sides.sort()
    print(f"Checked {n} of {len(train)} training images (longest side, in pixels)")
    print(f"  median {sides[n//2]} px")
    print(f"  smaller than 640:   {100*small/n:5.1f}%   (1280 training just blows these up)")
    print(f"  640 to 1279:        {100*mid/n:5.1f}%   (some real gain at 1280)")
    print(f"  1280 or bigger:     {100*big/n:5.1f}%   (full gain at 1280)")

    # ---- 2. Same model, scored at 640 vs 1280 -------------------------------------------------
    print("\n=== 2. Same model scored at 640 vs 1280 ===")
    if not BEST.exists():
        print(f"No best.pt found at {BEST}; skipping this part."); return
    from ultralytics import YOLO
    TMP.mkdir(parents=True, exist_ok=True)
    val = images("val")
    sub = random.sample(val, min(2000, len(val)))
    (TMP / "val_2000.txt").write_text("\n".join(str(p) for p in sub))
    test_yaml = TMP / "data_test.yaml"
    yaml.safe_dump({"path": str(base), "train": str(TMP / "val_2000.txt"), "val": str(TMP / "val_2000.txt"),
                    "names": cfg["names"]}, open(test_yaml, "w"))
    res = {}
    for size in (640, 1280):
        print(f"\nScoring at {size}px ...")
        m = YOLO(str(BEST)).val(data=str(test_yaml), imgsz=size, batch=8, plots=False, verbose=False,
                                project=str(TMP), name=f"val{size}", exist_ok=True, workers=4)
        res[size] = (m.box.map50, m.box.mp, m.box.mr)
    print("\n=== RESULTS ===")
    for size, (m50, p, r) in res.items():
        print(f"  {size}px:  mAP50 {m50:.3f}   precision {p:.3f}   recall {r:.3f}")
    d = res[1280][0] - res[640][0]
    print(f"\n1280 minus 640: {d:+.3f}")
    print("Note: this model was trained at 640, so it is a hint, not the final answer. If the images are")
    print("mostly small AND 1280 scores about the same or worse, train at 640 on the rental.")


if __name__ == "__main__":
    main()
