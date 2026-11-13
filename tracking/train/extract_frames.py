"""Turn video clips into training frames, with draft gun/knife boxes from the current model.

For every clip, one frame is taken every --step seconds (near-duplicate frames are skipped),
shrunk so its longest side is 640 pixels, and saved as a JPG. The current WatchDog model
(public/models/weapons.onnx) then draws draft boxes at a deliberately LOW confidence (15%), so
when you open the frames in a labeling tool you mostly fix or delete boxes instead of drawing
every one by hand. Frames where it finds nothing still get an empty label file: those are
"no weapon here" examples, which matter just as much.

Output layout (what merge_datasets.py and labeling tools expect):
    OUT/images/<clip>_<seconds>.jpg
    OUT/labels/<clip>_<seconds>.txt     YOLO lines: class cx cy w h (all 0..1)
    OUT/classes.txt                     gun, knife

Usage:
    python extract_frames.py hallway.mp4 lobby.mp4 --out my_frames
    python extract_frames.py clips_folder --out my_frames --step 1.0
    python extract_frames.py clip.mp4 --out my_frames --no-labels   # frames only
"""

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
MODEL = HERE.parent.parent / "public" / "models" / "weapons.onnx"
CLASS_NAMES = ["gun", "knife"]  # same order as prepare_weapon_data.py and the web demo
SIZE = 640  # the model's input size, and the size frames are saved at
DRAFT_CONF = 0.15  # low on purpose: deleting a wrong box is faster than drawing a missed one
NMS_IOU = 0.45
VIDEO_TYPES = {".mp4", ".mov", ".avi", ".mkv", ".m4v", ".webm", ".wmv"}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("videos", nargs="+", help="video files or folders of videos")
    parser.add_argument("--out", required=True, help="output folder (images/, labels/, classes.txt)")
    parser.add_argument("--step", type=float, default=0.5, help="seconds between frames (default 0.5)")
    parser.add_argument(
        "--min-change", type=float, default=0.02,
        help="skip a frame if it differs from the last kept one by less than this (0..1, default 0.02)",
    )
    parser.add_argument("--model", default=str(MODEL), help="ONNX model for draft boxes")
    parser.add_argument("--conf", type=float, default=DRAFT_CONF, help="draft box confidence (default 0.15)")
    parser.add_argument("--no-labels", action="store_true", help="save frames only, no draft boxes")
    return parser.parse_args()


def find_videos(paths):
    videos = []
    for p in map(Path, paths):
        if p.is_dir():
            videos += sorted(f for f in p.iterdir() if f.suffix.lower() in VIDEO_TYPES)
        elif p.suffix.lower() in VIDEO_TYPES:
            videos.append(p)
        else:
            print(f"skipping {p}: not a video file")
    return videos


def shrink(frame):
    h, w = frame.shape[:2]
    scale = min(1.0, SIZE / max(w, h))
    if scale < 1.0:
        frame = cv2.resize(frame, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return frame


def changed_enough(frame, last, min_change):
    """Mean absolute difference between two small grey versions of the frames, 0..1."""
    if last is None:
        return True
    a = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 36))
    b = cv2.resize(cv2.cvtColor(last, cv2.COLOR_BGR2GRAY), (64, 36))
    return np.abs(a.astype(np.float32) - b.astype(np.float32)).mean() / 255 >= min_change


def iou(a, b):
    x = max(0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    y = max(0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    inter = x * y
    return inter / (a[2] * a[3] + b[2] * b[3] - inter)


def load_model(path):
    try:
        import onnxruntime as ort
    except ImportError:
        sys.exit("onnxruntime is not installed. Run: pip install onnxruntime")
    if not Path(path).exists():
        sys.exit(f"Model not found: {path}\nPass --model path/to/weapons.onnx or use --no-labels.")
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def draft_boxes(session, frame, conf):
    """Boxes as (class, x, y, w, h, confidence) in frame pixels, like eval_clips.py."""
    h, w = frame.shape[:2]
    scale = SIZE / max(w, h)
    square = np.full((SIZE, SIZE, 3), 114, np.uint8)
    square[: round(h * scale), : round(w * scale)] = cv2.resize(
        frame, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_LINEAR
    )
    x = cv2.cvtColor(square, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32) / 255
    out = session.run(None, {session.get_inputs()[0].name: x})[0][0]  # (4 + classes, N)
    scores = out[4:]
    cls = scores.argmax(0)
    best = scores.max(0)
    found = []
    for i in np.flatnonzero(best >= conf):
        bw, bh = out[2, i] / scale, out[3, i] / scale
        found.append((int(cls[i]), out[0, i] / scale - bw / 2, out[1, i] / scale - bh / 2, bw, bh, float(best[i])))
    kept = []
    for box in sorted(found, key=lambda b: -b[5]):
        if all(k[0] != box[0] or iou(k[1:5], box[1:5]) < NMS_IOU for k in kept):
            kept.append(box)
    return kept


def yolo_lines(boxes, width, height):
    lines = []
    for cls, x, y, w, h, _ in boxes:
        cx = min(max((x + w / 2) / width, 0), 1)
        cy = min(max((y + h / 2) / height, 0), 1)
        lines.append(f"{cls} {cx:.6f} {cy:.6f} {min(w / width, 1):.6f} {min(h / height, 1):.6f}")
    return lines


def main():
    args = parse_args()
    videos = find_videos(args.videos)
    if not videos:
        sys.exit("No video files found.")
    out = Path(args.out)
    (out / "images").mkdir(parents=True, exist_ok=True)
    (out / "labels").mkdir(parents=True, exist_ok=True)
    (out / "classes.txt").write_text("\n".join(CLASS_NAMES) + "\n")
    session = None if args.no_labels else load_model(args.model)

    total_frames, total_boxes = 0, 0
    for video_path in videos:
        video = cv2.VideoCapture(str(video_path))
        fps = video.get(cv2.CAP_PROP_FPS) or 30
        frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
        if frames <= 0:
            print(f"{video_path.name}: could not read")
            continue
        every = max(1, round(fps * args.step))
        kept, boxes_here, last = 0, 0, None
        for index in range(0, frames, every):
            video.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, frame = video.read()
            if not ok:
                break
            frame = shrink(frame)
            if not changed_enough(frame, last, args.min_change):
                continue
            last = frame
            seconds = index / fps
            name = f"{video_path.stem}_{seconds:07.2f}s".replace(".", "_")
            cv2.imwrite(str(out / "images" / f"{name}.jpg"), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            lines = []
            if session is not None:
                boxes = draft_boxes(session, frame, args.conf)
                lines = yolo_lines(boxes, frame.shape[1], frame.shape[0])
                boxes_here += len(boxes)
            (out / "labels" / f"{name}.txt").write_text("\n".join(lines) + ("\n" if lines else ""))
            kept += 1
        video.release()
        total_frames += kept
        total_boxes += boxes_here
        print(f"{video_path.name}: {kept} frames saved, {boxes_here} draft boxes")

    print(f"\nDone: {total_frames} frames in {out / 'images'}, {total_boxes} draft boxes in {out / 'labels'}")
    if session is not None:
        print(
            f"Draft boxes are anything the model scored {args.conf:.0%} or higher, so expect wrong ones.\n"
            "Next: open the folder in a labeling tool, fix or delete the draft boxes, draw any the model\n"
            "missed, then merge with: python merge_datasets.py --extra " + str(out) + " ..."
        )


if __name__ == "__main__":
    main()
