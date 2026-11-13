"""Quick CPU fine-tune of the weapon model on a Windows (or any) computer with no graphics card.

This is the "I have 200 new CCTV frames and want them in the model tonight" route. It starts
from the model you already have (weapons.pt next to this script, or tracking/weapons.pt),
freezes the backbone so only the detection head learns, and trains at a smaller image size.
That keeps a CPU run to roughly 1-3 minutes per epoch per 1,000 images. Full training from
scratch still belongs in train_weapons.ipynb on a Colab GPU.

At the end it exports weapons.onnx for the web demo.

Usage:
    python train_local.py --data my_dataset/data.yaml
    python train_local.py --data my_dataset/data.yaml --epochs 25 --imgsz 512
    python train_local.py --data my_dataset/data.yaml --from runs/local/weights/best.pt
"""

import argparse
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
START_CANDIDATES = [HERE / "weapons.pt", HERE.parent / "weapons.pt"]
PUBLIC_MODEL = HERE.parent.parent / "public" / "models" / "weapons.onnx"
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", required=True, help="data.yaml of the dataset (see merge_datasets.py)")
    parser.add_argument("--from", dest="start", help="weights to start from (default: weapons.pt if found, else yolov8n.pt)")
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--imgsz", type=int, default=416, help="training image size (smaller = faster on CPU)")
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--freeze", type=int, default=10, help="layers to freeze (10 = the whole backbone)")
    parser.add_argument("--out", default=str(HERE / "runs"), help="where to write the run folder")
    return parser.parse_args()


def count_train_images(data_yaml):
    root = Path(data_yaml).resolve().parent
    text = Path(data_yaml).read_text(errors="ignore")
    for line in text.splitlines():
        if line.startswith("train:"):
            target = root / line.split(":", 1)[1].strip()
            if target.suffix == ".txt" and target.exists():
                return sum(1 for l in target.read_text().splitlines() if l.strip())
            if target.is_dir():
                return sum(1 for p in target.rglob("*") if p.suffix.lower() in IMAGE_TYPES)
    return 0


def main():
    args = parse_args()
    try:
        from ultralytics import YOLO
    except ImportError:
        sys.exit(
            "Ultralytics is not installed. From the tracking folder run:\n"
            "    pip install -r requirements.txt\n"
            "(or just: pip install ultralytics onnx onnxruntime)"
        )
    if not Path(args.data).exists():
        sys.exit(f"Dataset not found: {args.data}")

    start = args.start or next((str(p) for p in START_CANDIDATES if p.exists()), "yolov8n.pt")
    images = count_train_images(args.data)
    minutes = args.epochs * max(1, images) / 1000 * 2  # ~2 min per 1,000 images per epoch on a laptop CPU
    print(f"Starting from {start}")
    print(f"Training on {images} images for {args.epochs} epochs at {args.imgsz}px, backbone frozen.")
    print(f"Rough CPU time: {minutes:.0f} minutes ({minutes / 60:.1f} h). Ctrl+C stops early; the best\n"
          f"weights so far stay in {Path(args.out) / 'local' / 'weights' / 'best.pt'}.")
    if minutes > 240:
        print("That is long. Consider --epochs 8, a smaller dataset, or the Colab notebook instead.")

    model = YOLO(start)
    started = time.time()
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        workers=0,  # Windows: avoid multiprocessing dataloader problems
        device="cpu",
        freeze=args.freeze,
        project=args.out,
        name="local",
        exist_ok=True,
        plots=False,
        hsv_v=0.6,
        scale=0.7,
    )
    best = Path(args.out) / "local" / "weights" / "best.pt"
    print(f"\nTrained in {(time.time() - started) / 60:.0f} minutes. Best weights: {best}")

    print("Exporting ONNX for the web demo...")
    exported = Path(YOLO(str(best)).export(format="onnx", imgsz=640, batch=1, dynamic=False, simplify=True))
    onnx_path = HERE / "weapons.onnx"
    shutil.copy(exported, onnx_path)
    shutil.copy(best, HERE / "weapons.pt")
    print(f"\nDone. New model: {onnx_path}")
    print(f"Also saved {HERE / 'weapons.pt'} as the starting point for next time.")
    print(f"\nTo use it in the web demo, copy it over the old one:\n    {PUBLIC_MODEL}")
    print("Then check false alarms did not go up: python ../eval_clips.py CLIP_DIR --model "
          f"{onnx_path}")


if __name__ == "__main__":
    main()
