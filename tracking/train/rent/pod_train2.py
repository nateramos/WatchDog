"""WatchDog: the main RunPod run (640 px, AdamW). Result: mAP50 0.868 (gun 0.870).

Rebuilt Oct 26 2026 from this run's own settings file (charts/run_640/args.yaml), so the
values below are exactly what ran. Start it on the pod with:
    setsid nohup python /workspace/pod_train2.py >> /workspace/train640.log 2>&1 &

Why AdamW: the first RunPod run (pod_train.py, 1280 px) used Ultralytics' optimizer=auto,
which picks MuSGD at lr 0.01 for long runs and ignores lr0. It collapsed at pass 4 the same
way the AMD PC run did. AdamW at lr0=0.001 with a 2-pass warmup (the Ultralytics
fine-tuning advice) trained cleanly for all 16 passes.

Starts from pass2_best.pt: pass 2 of the AMD PC run (mAP50 0.695), copied to /workspace.
"""
import shutil

import albumentations as A
import numpy as np
import onnxruntime as ort
from ultralytics import YOLO

D = "/workspace/dataset"
W = "/workspace/runs"

# Same extra tricks as every WatchDog run: cutout (hidden guns) and bad-CCTV effects.
EXTRA = [
    A.CoarseDropout(num_holes_range=(1, 4), hole_height_range=(0.03, 0.08), hole_width_range=(0.03, 0.08), fill=114, p=0.4),
    A.MotionBlur(blur_limit=(3, 7), p=0.05),
    A.ImageCompression(quality_range=(30, 90), p=0.05),
    A.GaussNoise(std_range=(0.02, 0.08), p=0.05),
    A.Blur(p=0.01), A.MedianBlur(p=0.01), A.ToGray(p=0.01), A.CLAHE(p=0.01),
]

YOLO("/workspace/pass2_best.pt").train(
    data=f"{D}/data.yaml",
    imgsz=640,
    epochs=16,
    patience=8,
    batch=48,
    workers=16,
    optimizer="AdamW",
    lr0=0.001,
    lrf=0.01,
    momentum=0.937,
    weight_decay=0.0005,
    warmup_epochs=2,
    amp=True,
    deterministic=False,
    augmentations=EXTRA,
    scale=0.7, degrees=10, translate=0.1, fliplr=0.5, flipud=0.0,
    hsv_h=0.015, hsv_s=0.7, hsv_v=0.6,
    mosaic=1.0, close_mosaic=4, mixup=0.0, copy_paste=0.0,
    save_period=1,
    cache=False,
    project=W, name="weapons_640", exist_ok=True, seed=0,
)

best = f"{W}/weapons_640/weights/best.pt"
shutil.copy(best, "/workspace/weapons_new.pt")
m = YOLO(best).val(data=f"{D}/data.yaml", imgsz=640, batch=16)
print(f"FINAL mAP50 {m.box.map50:.3f} (gun {m.box.ap50[0]:.3f})")
onnx = YOLO(best).export(format="onnx", imgsz=640, batch=1, dynamic=False, simplify=True)
shutil.copy(onnx, "/workspace/weapons_new.onnx")
s = ort.InferenceSession("/workspace/weapons_new.onnx")
out = s.run(None, {s.get_inputs()[0].name: np.zeros((1, 3, 640, 640), np.float32)})[0]
assert out.shape == (1, 6, 8400), f"unexpected output shape {out.shape}"
print("ALL DONE: /workspace/weapons_new.onnx (browser), /workspace/weapons_new.pt")
