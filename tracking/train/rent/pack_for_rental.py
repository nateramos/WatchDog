"""Pack the WatchDog dataset for training on a rented GPU.

Shrinks every image to at most 1280 px on its long side (the training size, so nothing the
model sees is lost) and writes one file, C:\\watchdog_data\\upload\\watchdog_dataset.tar,
that also holds the training script for the rented machine. Run pack_for_rental.ps1, not this.
"""
import io
import os
import sys
import tarfile
import time
from multiprocessing import Pool
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(os.environ.get("WATCHDOG_DATA", r"C:\watchdog_data"))
DATA = ROOT / "dataset"
OUT = ROOT / "upload" / "watchdog_dataset.tar"
HERE = Path(__file__).resolve().parent
MAX_SIDE = 1280


def shrink(path):
    """(name inside the tar, jpg bytes) for one image, or None if it can't be read."""
    try:
        im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        if max(im.size) > MAX_SIDE:
            im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=90)
        return f"dataset/images/{path.parent.name}/{path.name}", buf.getvalue()
    except Exception as e:  # a broken image: leave it out (Ultralytics would skip it too)
        print("skipped", path.name, e)
        return None


def add(tar, name, data):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mtime = int(time.time())
    tar.addfile(info, io.BytesIO(data))


def main():
    images = sorted((DATA / "images" / "train").glob("*.jpg")) + sorted((DATA / "images" / "val").glob("*.jpg"))
    if not images:
        sys.exit(f"No images in {DATA}. Build the dataset first (train_full_pc.ps1).")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    print(f"Packing {len(images)} images into {OUT} ...")

    with tarfile.open(OUT, "w") as tar:
        # The training list, with paths relative to the dataset folder so it works on Linux.
        lines = []
        for line in (DATA / "train.txt").read_text().splitlines():
            if line.strip():
                lines.append("./images/train/" + line.strip().replace("\\", "/").split("/")[-1])
        add(tar, "dataset/train.txt", "\n".join(lines).encode())
        for split in ("train", "val"):
            for lbl in (DATA / "labels" / split).glob("*.txt"):
                add(tar, f"dataset/labels/{split}/{lbl.name}", lbl.read_bytes())
        for f in ("pod_train.sh", "pod_train.py"):
            add(tar, f, (HERE / f).read_bytes().replace(b"\r\n", b"\n"))

        start = time.time()
        with Pool(max(1, (os.cpu_count() or 2) - 1)) as pool:
            for i, item in enumerate(pool.imap(shrink, images, chunksize=64), 1):
                if item:
                    add(tar, *item)
                if i % 5000 == 0:
                    rate = i / (time.time() - start)
                    print(f"  {i}/{len(images)}  ({(len(images) - i) / rate / 60:.0f} min left)", flush=True)

    print(f"Done: {OUT}  ({OUT.stat().st_size / 1e9:.1f} GB)")


if __name__ == "__main__":
    main()
