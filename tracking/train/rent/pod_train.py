"""WatchDog gun model training on a rented NVIDIA GPU (started by pod_train.sh).

Same model, data and settings as train_full_pc.py, but with NVIDIA's normal half-precision
check left on (it works properly on NVIDIA cards) and a bigger batch on 24 GB+ cards.
If the machine restarts, running pod_train.sh again resumes from the last finished pass.
"""
import os
import shutil
from pathlib import Path

import albumentations as A
import numpy as np
import onnxruntime as ort
import torch
from ultralytics import YOLO

D = "/workspace/dataset"
W = "/workspace/runs"
SIZE = 1280          # training size: more detail for small, far-away guns
BROWSER_SIZE = 640   # the browser demo runs the model at 640

# Extra tricks on top of YOLO's own (mosaic, zoom, shift, tilt, flips, brightness/colour):
#  - Cutout: 1-4 grey blocks (3-8% of the picture each) on 40% of images, like a hand, bag or
#    jacket covering part of the gun (used for CCTV weapon detection in MDPI Appl. Sci. 14/8198).
#  - A little motion blur, heavy JPEG and sensor noise (bad CCTV), plus YOLO's usual extras.
EXTRA = [
    A.CoarseDropout(num_holes_range=(1, 4), hole_height_range=(0.03, 0.08), hole_width_range=(0.03, 0.08), fill=114, p=0.4),
    A.MotionBlur(blur_limit=(3, 7), p=0.05),
    A.ImageCompression(quality_range=(30, 90), p=0.05),
    A.GaussNoise(std_range=(0.02, 0.08), p=0.05),
    A.Blur(p=0.01), A.MedianBlur(p=0.01), A.ToGray(p=0.01), A.CLAHE(p=0.01),
]

Path(f"{D}/data.yaml").write_text(f"path: {D}\ntrain: train.txt\nval: images/val\nnames:\n  0: gun\n  1: knife\n")
last = Path(f"{W}/weapons/weights/last.pt")

if last.exists():
    print("Resuming from", last)
    YOLO(str(last)).train(resume=True)
else:
    gb = torch.cuda.get_device_properties(0).total_memory / 1e9
    print(f"GPU: {torch.cuda.get_device_name(0)} ({gb:.0f} GB)")
    YOLO("yolo11m.pt").train(
        data=f"{D}/data.yaml",
        imgsz=SIZE,
        epochs=20,          # upper limit; stops by itself after 8 passes without improvement
        patience=8,
        augmentations=EXTRA,
        batch=8 if gb < 30 else (16 if gb < 60 else 32),   # 1280 px images use 4x the memory
        workers=min(16, os.cpu_count() or 8),
        amp=True,
        deterministic=False,
        save_period=1,
        cache=False,
        scale=0.7,
        degrees=10,
        flipud=0.0,
        hsv_v=0.6,
        mosaic=1.0,
        close_mosaic=5,
        project=W,
        name="weapons",
        exist_ok=True,
        seed=0,
    )

shutil.copy(f"{W}/weapons/weights/best.pt", "/workspace/weapons_new.pt")
# Two versions of the same model: 640 for the browser demo now, 1280 for a backend later.
for size, name, anchors in ((BROWSER_SIZE, "weapons_new.onnx", 8400), (SIZE, "weapons_new_1280.onnx", 33600)):
    best = YOLO(f"{W}/weapons/weights/best.pt")
    m = best.val(data=f"{D}/data.yaml", imgsz=size, batch=8)
    print(f"FINAL at {size} px: mAP50 gun {m.box.ap50[0]:.3f}   mAP50-95 gun {m.box.maps[0]:.3f}")
    onnx = best.export(format="onnx", imgsz=size, batch=1, dynamic=False, simplify=True)
    shutil.copy(onnx, f"/workspace/{name}")
    s = ort.InferenceSession(f"/workspace/{name}")
    out = s.run(None, {s.get_inputs()[0].name: np.zeros((1, 3, size, size), np.float32)})[0]
    assert out.shape == (1, 6, anchors), f"unexpected output shape {out.shape}"
print("ALL DONE. Files: /workspace/weapons_new.onnx (browser), weapons_new_1280.onnx (backend), weapons_new.pt")
