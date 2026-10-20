"""Run the web demo's weapon check on a set of test clips and report what it flagged.

This copies src/detector.js and the scan loop in src/Demo.jsx: the same ONNX model,
40% threshold, one checked frame every half second, the extra turned-frame check, and
flags of the same kind within 1.5 seconds merged into one event. Results can differ
slightly from the browser because frames are resized by OpenCV instead of a canvas.

Usage:
    python eval_clips.py CLIP_DIR             # clips listed in eval/clips.csv
    python eval_clips.py CLIP_DIR --people    # only flag weapons near a person
Writes eval/results.csv and, for each flag event, a snapshot in eval/output/.
"""

import argparse
import csv
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

HERE = Path(__file__).resolve().parent
MODEL = HERE.parent / "public" / "models" / "weapons.onnx"
PEOPLE_MODEL = HERE.parent / "public" / "models" / "people.onnx"  # COCO YOLOv8n
CLIPS = HERE / "eval" / "clips.csv"
RESULTS = HERE / "eval" / "results.csv"
OUTPUT = HERE / "eval" / "output"

# Same values as src/detector.js, src/boxes.js and src/Demo.jsx.
CLASS_NAMES = ["gun", "knife"]
FLAGGED = ["gun"]  # the model also knows knives, but WatchDog flags firearms only
FLAG_CONF = 0.4
SURE_CONF = 0.7
SAME_OBJECT = 0.5
NMS_IOU = 0.45
SIZE = 640
MAX_SAMPLES = 120
MIN_STEP = 0.5
MERGE_GAP = 1.5
PERSON_CONF = 0.3
PERSON_MARGIN = 0.2


def overlap(a, b):
    x = max(0, min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]))
    y = max(0, min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"]))
    return x * y


def iou(a, b):
    i = overlap(a, b)
    return i / (a["w"] * a["h"] + b["w"] * b["h"] - i)


def containment(a, b):
    return overlap(a, b) / min(a["w"] * a["h"], b["w"] * b["h"])


def nms(boxes, overlaps=lambda a, b: iou(a, b) >= NMS_IOU):
    kept = []
    for box in sorted(boxes, key=lambda b: -b["confidence"]):
        if all(k["label"] != box["label"] or not overlaps(k, box) for k in kept):
            kept.append(box)
    return kept


def run(session, frame, rotated=False, names=CLASS_NAMES, keep=FLAGGED, min_conf=FLAG_CONF):
    if rotated:
        frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
    h, w = frame.shape[:2]
    scale = SIZE / max(w, h)
    square = np.full((SIZE, SIZE, 3), 114, np.uint8)
    square[: round(h * scale), : round(w * scale)] = cv2.resize(
        frame, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_LINEAR
    )
    x = cv2.cvtColor(square, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32) / 255
    out = session.run(None, {session.get_inputs()[0].name: x})[0][0]  # (4 + classes, N)
    scores = out[4 : 4 + len(names)]  # COCO has 80 classes; person is the first
    cls = scores.argmax(0)
    best = scores.max(0)
    boxes = []
    for i in np.flatnonzero(best >= min_conf):
        if names[cls[i]] not in keep:
            continue
        bw, bh = out[2, i] / scale, out[3, i] / scale
        boxes.append({
            "x": out[0, i] / scale - bw / 2, "y": out[1, i] / scale - bh / 2, "w": bw, "h": bh,
            "label": names[cls[i]], "confidence": float(best[i]),
        })
    return nms(boxes)


def detect(session, frame):
    upright = run(session, frame, False)
    if any(b["confidence"] >= SURE_CONF for b in upright):
        return upright
    height = frame.shape[0]
    back = [
        {**b, "x": b["y"], "y": height - (b["x"] + b["w"]), "w": b["h"], "h": b["w"]}
        for b in run(session, frame, True)
    ]
    return nms(upright + back, lambda a, b: containment(a, b) >= SAME_OBJECT)


def near_person(box, people):
    """Same as nearPerson in src/boxes.js."""
    for p in people:
        mx, my = p["w"] * PERSON_MARGIN, p["h"] * PERSON_MARGIN
        if (box["x"] < p["x"] + p["w"] + mx and box["x"] + box["w"] > p["x"] - mx
                and box["y"] < p["y"] + p["h"] + my and box["y"] + box["h"] > p["y"] - my):
            return True
    return False


def keep_near_people(people_session, frame, boxes):
    """Drop weapon boxes that are not near a person. People are only looked for when needed."""
    if not boxes:
        return boxes
    people = run(people_session, frame, names=["person"], keep=["person"], min_conf=PERSON_CONF)
    return [b for b in boxes if near_person(b, people)]


def checked_frames(path):
    """Yield (time, frame) for the frames the web demo would check."""
    video = cv2.VideoCapture(str(path))
    fps = video.get(cv2.CAP_PROP_FPS)
    duration = video.get(cv2.CAP_PROP_FRAME_COUNT) / fps
    step = max(MIN_STEP, duration / MAX_SAMPLES)
    t, index = 0.0, 0
    while t < duration:
        ok, frame = video.read()
        if not ok:
            break
        if index / fps >= t - 0.5 / fps:
            yield t, frame
            t += step
        index += 1
    video.release()


def scan(session, path, people_session=None):
    events, frames, flagged = [], 0, 0
    for t, frame in checked_frames(path):
        frames += 1
        boxes = detect(session, frame)
        if people_session:
            boxes = keep_near_people(people_session, frame, boxes)
        flagged += bool(boxes)
        for box in boxes:
            last = next((e for e in reversed(events) if e["label"] == box["label"]), None)
            if last and t - last["last"] <= MERGE_GAP:
                last["last"] = t
                if box["confidence"] > last["confidence"]:
                    last.update(time=t, confidence=box["confidence"], box=box, frame=frame)
            else:
                events.append({"label": box["label"], "confidence": box["confidence"],
                               "time": t, "last": t, "box": box, "frame": frame})
    return frames, flagged, events


def save_snapshot(event, name):
    frame = event["frame"].copy()
    b = event["box"]
    p1 = (int(b["x"]), int(b["y"]))
    p2 = (int(b["x"] + b["w"]), int(b["y"] + b["h"]))
    cv2.rectangle(frame, p1, p2, (0, 0, 255), 3)
    cv2.putText(frame, f'{b["label"]} {b["confidence"]:.0%}', (p1[0], max(30, p1[1] - 10)),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    cv2.imwrite(str(OUTPUT / name), frame)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("clip_dir", type=Path)
    parser.add_argument("--people", action="store_true", help="only flag weapons near a person")
    args = parser.parse_args()

    session = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])
    people_session = (ort.InferenceSession(str(PEOPLE_MODEL), providers=["CPUExecutionProvider"])
                      if args.people else None)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rows = []
    with open(CLIPS, newline="") as f:
        for clip in csv.DictReader(f):
            path = args.clip_dir / clip["file"]
            if not path.exists():
                print(f"missing {path}", file=sys.stderr)
                continue
            frames, flagged, events = scan(session, path, people_session)
            for i, e in enumerate(events):
                save_snapshot(e, f'{path.stem}_{i + 1}_{e["label"]}.jpg')
            flags = "; ".join(f'{e["label"]} {e["confidence"]:.0%} at {e["time"]:.1f}s' for e in events)
            rows.append({**clip, "frames_checked": frames, "frames_flagged": flagged,
                         "flag_events": len(events), "flags": flags or "none"})
            print(f'{clip["file"]}: {flagged}/{frames} frames flagged; {flags or "none"}')

    with open(RESULTS, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
