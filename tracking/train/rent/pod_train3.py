"""WatchDog: 960 px fine-tune of the 640 model. Result: mAP50 0.863-0.864 (gun 0.871), about a tie,
so the 640 model stayed in the browser (960 is 2.25x the work per frame for no gain).

Rebuilt Oct 26 2026 from this run's own settings file (charts/run_960/args.yaml), so the
values below are exactly what ran. Run after pod_train2.py:
    setsid nohup python /workspace/pod_train3.py >> /workspace/train960.log 2>&1 &

Idea: most training photos are about 800 px, so 960 keeps more detail for small, far-away guns
than 640 does. Lower learning rate (0.0003) and a smaller batch (24, bigger images) than the
640 run; 6 passes, mosaic off for the last 3.
"""
import shutil

import albumentations as A
import numpy as np
import onnxruntime as ort
from ultralytics import YOLO

D = "/workspace/dataset"
W = "/workspace/runs"

EXTRA = [
    A.CoarseDropout(num_holes_range=(1, 4), hole_height_range=(0.03, 0.08), hole_width_range=(0.03, 0.08), fill=114, p=0.4),
    A.MotionBlur(blur_limit=(3, 7), p=0.05),
    A.ImageCompression(quality_range=(30, 90), p=0.05),
    A.GaussNoise(std_range=(0.02, 0.08), p=0.05),
    A.Blur(p=0.01), A.MedianBlur(p=0.01), A.ToGray(p=0.01), A.CLAHE(p=0.01),
]

YOLO(f"{W}/weapons_640/weights/best.pt").train(
    data=f"{D}/data.yaml",
    imgsz=960,
    epochs=6,
    patience=4,
    batch=24,
    workers=16,
    optimizer="AdamW",
    lr0=0.0003,
    lrf=0.1,
    momentum=0.937,
    weight_decay=0.0005,
    warmup_epochs=1,
    amp=True,
    deterministic=False,
    augmentations=EXTRA,
    scale=0.7, degrees=10, translate=0.1, fliplr=0.5, flipud=0.0,
    hsv_h=0.015, hsv_s=0.7, hsv_v=0.6,
    mosaic=1.0, close_mosaic=3, mixup=0.0, copy_paste=0.0,
    save_period=1,
    cache=False,
    project=W, name="weapons_960", exist_ok=True, seed=0,
)

best = f"{W}/weapons_960/weights/best.pt"
shutil.copy(best, "/workspace/weapons_960.pt")
m = YOLO(best).val(data=f"{D}/data.yaml", imgsz=960, batch=8)
print(f"FINAL mAP50 {m.box.map50:.3f} (gun {m.box.ap50[0]:.3f})")
onnx = YOLO(best).export(format="onnx", imgsz=960, batch=1, dynamic=False, simplify=True)
shutil.copy(onnx, "/workspace/weapons_960.onnx")
s = ort.InferenceSession("/workspace/weapons_960.onnx")
out = s.run(None, {s.get_inputs()[0].name: np.zeros((1, 3, 960, 960), np.float32)})[0]
assert out.shape == (1, 6, 18900), f"unexpected output shape {out.shape}"
print("ALL DONE: /workspace/weapons_960.onnx, /workspace/weapons_960.pt")
