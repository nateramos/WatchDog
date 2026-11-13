"""WatchDog: measure the exact size of EVERY training and validation image (no GPU, ~2-5 min).
Reads only the image headers; changes nothing. Results also go to size_scan.log."""
import os
from pathlib import Path
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import yaml
from PIL import Image

ROOT = Path(os.environ.get("WATCHDOG_DATA", r"C:\watchdog_data"))
DATA_YAML = ROOT / "dataset" / "data.yaml"
IMG_TYPES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

def size(f):
    try:
        with Image.open(f) as im:
            return f, im.size
    except Exception:
        return f, None

def main():
    cfg = yaml.safe_load(open(DATA_YAML))
    base = Path(cfg.get("path", DATA_YAML.parent))
    for split in ("train", "val"):
        p = Path(cfg[split]); p = p if p.is_absolute() else base / p
        files = ([Path(l.strip()) for l in open(p) if l.strip()] if p.suffix == ".txt"
                 else [f for f in p.rglob("*") if f.suffix.lower() in IMG_TYPES])
        print(f"\n================ {split.upper()}: {len(files)} images ================")
        with ThreadPoolExecutor(16) as ex:
            res = list(ex.map(size, files, chunksize=256))
        bad = sum(1 for _, s in res if s is None)
        ok = [(f, s) for f, s in res if s]
        longs = sorted(max(s) for _, s in ok)
        n = len(longs)
        pct = lambda q: longs[min(n - 1, int(q * n))]
        print(f"Unreadable: {bad}")
        print(f"Longest side: min {longs[0]}  10% {pct(.10)}  25% {pct(.25)}  median {pct(.5)}"
              f"  75% {pct(.75)}  90% {pct(.90)}  max {longs[-1]}")
        bins = [(0, 320), (320, 480), (480, 640), (640, 800), (800, 960), (960, 1280), (1280, 10**9)]
        print("Longest side buckets:")
        for a, b in bins:
            c = sum(1 for x in longs if a <= x < b)
            label = f"{a}-{b-1}" if b < 10**9 else f"{a}+"
            print(f"  {label:>10} px: {c:7d}  ({100*c/n:5.1f}%)  {'#' * int(50*c/n)}")
        print("10 most common exact sizes (width x height):")
        for (w, h), c in Counter(s for _, s in ok).most_common(10):
            print(f"  {w:5d} x {h:<5d} {c:7d}  ({100*c/n:5.1f}%)")
        src = defaultdict(list)
        for f, s in ok:
            src[f.stem.split("_")[0]].append(max(s))
        print("By source dataset (from file name prefix):")
        for k, v in sorted(src.items(), key=lambda kv: -len(kv[1])):
            v.sort()
            print(f"  {k:<22} {len(v):7d} images   median longest side {v[len(v)//2]} px")

if __name__ == "__main__":
    main()
