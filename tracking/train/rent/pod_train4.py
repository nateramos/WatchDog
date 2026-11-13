"""Fine-tune the finished 640 model with look-alike photos (started by pod_neg.sh).

Starts from the 640 model (mAP50 0.868) and trains 5 short passes on the full gun/knife set
PLUS the look-alikes from pod_negatives.py (empty labels = "not a gun"). Low learning rate so
it keeps what it knows. Before and after, it counts false alarms on held-out look-alikes the
model never trained on, and re-checks mAP50 on the normal quiz, so we can see both effects.
"""
import shutil
from pathlib import Path

import albumentations as A
import numpy as np
import onnxruntime as ort
from ultralytics import YOLO

D = Path("/workspace/dataset")
NEG = Path("/root/data/neg")
W = "/workspace/runs"
START = next(p for p in (Path("/workspace/weapons_new.pt"), Path("/workspace/runs/weapons_640/weights/best.pt")) if p.exists())

EXTRA = [
    A.CoarseDropout(num_holes_range=(1, 4), hole_height_range=(0.03, 0.08), hole_width_range=(0.03, 0.08), fill=114, p=0.4),
    A.MotionBlur(blur_limit=(3, 7), p=0.05),
    A.ImageCompression(quality_range=(30, 90), p=0.05),
    A.GaussNoise(std_range=(0.02, 0.08), p=0.05),
    A.Blur(p=0.01), A.MedianBlur(p=0.01), A.ToGray(p=0.01), A.CLAHE(p=0.01),
]


def false_alarms(weights):
    """Share of held-out look-alike photos with a gun/knife box at 60%+ (instant flag) and 25%+."""
    test = sorted((NEG / "images" / "test").glob("*.jpg"))
    model = YOLO(str(weights))
    hi = lo = 0
    for i in range(0, len(test), 64):  # small chunks: a 5k-image list at once runs out of GPU memory
        for r in model.predict([str(p) for p in test[i:i + 64]], imgsz=640, conf=0.25, batch=16, verbose=False):
            c = r.boxes.conf.cpu().numpy() if len(r.boxes) else np.array([])
            lo += bool(len(c))
            hi += bool((c >= 0.6).any())
    del model
    import torch, gc; gc.collect(); torch.cuda.empty_cache()
    print(f"  {weights}: flagged at 60%+ on {hi}/{len(test)} ({100 * hi / len(test):.1f}%), any box 25%+ on {lo}/{len(test)} ({100 * lo / len(test):.1f}%)", flush=True)


lines = (D / "train.txt").read_text().split()
neg = (NEG / "train.txt").read_text().split()
(D / "train_neg.txt").write_text("\n".join(lines + neg) + "\n")
(D / "data_neg.yaml").write_text(f"path: {D}\ntrain: train_neg.txt\nval: images/val\nnames:\n  0: gun\n  1: knife\n")
print(f"Training list: {len(lines)} original + {len(neg)} look-alikes ({100 * len(neg) / (len(lines) + len(neg)):.0f}% extra)")

print("BEFORE (current 640 model):")
false_alarms(START)

YOLO(str(START)).train(
    data=str(D / "data_neg.yaml"),
    imgsz=640,
    epochs=5,
    patience=5,
    optimizer="AdamW",
    lr0=0.0003,          # low: polish, don't relearn (the first run used 0.001)
    lrf=0.1,
    momentum=0.937,
    weight_decay=0.0005,
    warmup_epochs=0.5,
    batch=32,
    workers=16,
    amp=True,
    deterministic=False,
    augmentations=EXTRA,
    scale=0.7, degrees=10, flipud=0.0, hsv_v=0.6,
    mosaic=1.0, close_mosaic=2,
    save_period=1,
    project=W, name="weapons_neg", exist_ok=True, seed=0,
)

best = Path(f"{W}/weapons_neg/weights/best.pt")
print("AFTER (with look-alikes):")
false_alarms(best)
m = YOLO(str(best)).val(data=str(D / "data_neg.yaml"), imgsz=640, batch=16)
print(f"FINAL quiz mAP50 {m.box.map50:.3f} (gun {m.box.ap50[0]:.3f}, before 0.868 / gun 0.870)")

shutil.copy(best, "/workspace/weapons_neg.pt")
onnx = YOLO(str(best)).export(format="onnx", imgsz=640, batch=1, dynamic=False, simplify=True)
shutil.copy(onnx, "/workspace/weapons_neg.onnx")
s = ort.InferenceSession("/workspace/weapons_neg.onnx")
out = s.run(None, {s.get_inputs()[0].name: np.zeros((1, 3, 640, 640), np.float32)})[0]
assert out.shape == (1, 6, 8400), f"unexpected output shape {out.shape}"
print("ALL DONE: /workspace/weapons_neg.onnx")
