"""Make the three "what WatchDog sees" pictures for the demo page.

One frame of the demo clip, drawn three ways:
  1. person.jpg  - person detection: shaded yellow box and white arm skeleton
  2. objects.jpg - object detection: blue box around the whole rifle
  3. weapon.jpg  - weapon detection: red box

Run from the tracking folder:
  .venv/bin/python make_demo_images.py
"""

from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

CLIP = Path("../public/samples/sample-pexels-4006667.mp4")
OUT = Path("../public/images")
TIME = 4.0  # seconds into the clip
WIDTH = 1280  # output width; height keeps the clip's shape

PERSON_COLOR = (0, 255, 255)  # BGR yellow, same as track.py
BONE_COLOR = (255, 255, 255)  # BGR white, same as track.py
OBJECT_COLOR = (255, 140, 30)  # BGR blue
WEAPON_COLOR = (0, 0, 255)  # BGR red, same as track.py
GLOW_COLOR = (255, 230, 200)  # BGR pale blue-white glow around the skeleton
PERSON_SHADE = 0.16  # how strongly the yellow fills the person box

WEAPON_CONF = 0.4

# Hand-placed arm joints for this frame (x, y in the 1280-wide picture).
# The pose model only places a few joints here, some in the wrong spot (it puts the
# nose on the rifle grip), because the shooter is side-on in dark camo. These points
# illustrate the arms a pose model tracks to see what someone is holding.
POSE = {
    "near_shoulder": (285, 375),
    "near_elbow": (455, 520),
    "near_wrist": (625, 330),
    "far_shoulder": (545, 375),
    "far_elbow": (860, 335),
    "far_wrist": (930, 165),
}
POSE_BONES = [
    ("near_shoulder", "near_elbow"), ("near_elbow", "near_wrist"),
    ("far_shoulder", "far_elbow"), ("far_elbow", "far_wrist"),
]

# Hand-placed box around the whole rifle, stock to front sight. The everyday model
# only boxes the front half (as a "baseball bat", 17%).
OBJECT_BOX = (295, 8, 1200, 400)

FONT = cv2.FONT_HERSHEY_SIMPLEX


def read_frame():
    cap = cv2.VideoCapture(str(CLIP))
    cap.set(cv2.CAP_PROP_POS_MSEC, TIME * 1000)
    ok, frame = cap.read()
    if not ok:
        raise SystemExit(f"Could not read {CLIP} at {TIME}s")
    scale = WIDTH / frame.shape[1]
    return cv2.resize(frame, (WIDTH, round(frame.shape[0] * scale)), interpolation=cv2.INTER_AREA)


def draw_corners(frame, box, color, length=18):
    x1, y1, x2, y2 = box
    for x, y, dx, dy in ((x1, y1, 1, 1), (x2, y1, -1, 1), (x1, y2, 1, -1), (x2, y2, -1, -1)):
        cv2.line(frame, (x, y), (x + dx * length, y), color, 4, cv2.LINE_AA)
        cv2.line(frame, (x, y), (x, y + dy * length), color, 4, cv2.LINE_AA)


def draw_box(frame, box, label, color, text_color):
    x1, y1, x2, y2 = box
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)
    draw_corners(frame, box, color)
    (w, h), _ = cv2.getTextSize(label, FONT, 0.7, 2)
    top = max(0, y1 - h - 12)
    cv2.rectangle(frame, (x1, top), (x1 + w + 12, top + h + 12), color, -1)
    cv2.putText(frame, label, (x1 + 6, top + h + 6), FONT, 0.7, text_color, 2, cv2.LINE_AA)


def draw_readout(frame, lines, color, text_color):
    """Labels stacked in the top-left corner of the picture instead of on the box."""
    y = 16
    for label in lines:
        (w, h), _ = cv2.getTextSize(label, FONT, 0.9, 2)
        cv2.rectangle(frame, (16, y), (16 + w + 20, y + h + 20), color, -1)
        cv2.putText(frame, label, (26, y + h + 10), FONT, 0.9, text_color, 2, cv2.LINE_AA)
        y += h + 30


def as_box(xyxy):
    return tuple(int(v) for v in xyxy)


def find_people(frame):
    """[(box, confidence)] for each person the pose model finds."""
    result = YOLO("yolov8n-pose.pt")(frame, verbose=False)[0]
    return [(as_box(xyxy), float(conf)) for xyxy, conf in zip(result.boxes.xyxy, result.boxes.conf)]


def shade_people(frame, people):
    """Yellow shading inside each person box."""
    shade = frame.copy()
    for box, _ in people:
        cv2.rectangle(shade, box[:2], box[2:], PERSON_COLOR, -1)
    return cv2.addWeighted(shade, PERSON_SHADE, frame, 1 - PERSON_SHADE, 0)


def draw_people(frame, people):
    for box, conf in people:
        draw_box(frame, box, f"PERSON {conf:.0%}", PERSON_COLOR, (0, 0, 0))


def person_image(frame):
    people = find_people(frame)
    out = shade_people(frame, people)

    # The skeleton is the hand-placed POSE (see above); the boxes come from the model.
    bones = [(POSE[a], POSE[b]) for a, b in POSE_BONES]
    joints = list(POSE.values())

    # Soft glow: thick lines, blurred, then added on top of the picture.
    glow = np.zeros_like(out)
    for a, b in bones:
        cv2.line(glow, a, b, GLOW_COLOR, 16, cv2.LINE_AA)
    for j in joints:
        cv2.circle(glow, j, 10, GLOW_COLOR, -1, cv2.LINE_AA)
    out = cv2.addWeighted(out, 1, cv2.GaussianBlur(glow, (0, 0), 9), 0.55, 0)

    # Crisp white bones, and joints drawn as a ring with a dot.
    for a, b in bones:
        cv2.line(out, a, b, BONE_COLOR, 4, cv2.LINE_AA)
    for j in joints:
        cv2.circle(out, j, 9, BONE_COLOR, 2, cv2.LINE_AA)
        cv2.circle(out, j, 4, BONE_COLOR, -1, cv2.LINE_AA)

    draw_people(out, people)
    return out


def objects_image(frame):
    out = frame.copy()
    draw_box(out, OBJECT_BOX, "OBJECT", OBJECT_COLOR, (255, 255, 255))
    return out


def weapon_image(frame):
    out = frame.copy()
    result = YOLO("weapons.pt")(frame, verbose=False, conf=WEAPON_CONF)[0]
    labels = []
    for xyxy, cls, conf in zip(result.boxes.xyxy, result.boxes.cls, result.boxes.conf):
        box = as_box(xyxy)
        cv2.rectangle(out, box[:2], box[2:], WEAPON_COLOR, 2, cv2.LINE_AA)
        draw_corners(out, box, WEAPON_COLOR)
        labels.append(f"POSSIBLE {result.names[int(cls)].upper()} {float(conf):.0%}")
    draw_readout(out, labels, WEAPON_COLOR, (255, 255, 255))
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    frame = read_frame()
    for name, make in (("person", person_image), ("objects", objects_image), ("weapon", weapon_image)):
        path = OUT / f"{name}.jpg"
        cv2.imwrite(str(path), make(frame), [cv2.IMWRITE_JPEG_QUALITY, 82])
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
