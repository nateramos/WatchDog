"""Lightweight, CPU-only person tracking for WatchDog.

Everything runs on this computer. People are found by YOLO and followed from
frame to frame by box position only, and each person's body pose comes from
MediaPipe. There is no facial recognition. Webcam frames are only shown on screen; they
are never saved or uploaded.

Usage:
    python track.py                 # asks: video file or webcam
    python track.py path/to/video.mp4
    python track.py --webcam
"""

import argparse
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Keep Ultralytics (used once, to convert the model) offline: no analytics or hub calls.
os.environ.setdefault("YOLO_OFFLINE", "1")
os.environ.setdefault("GLOG_minloglevel", "2")  # quiet MediaPipe's startup logs

import certifi

# MediaPipe downloads its pose model on first run with urllib, which can't find
# root certificates on python.org installs of Python for macOS.
os.environ.setdefault("SSL_CERT_FILE", certifi.where())

import cv2
import numpy as np

# MediaPipe and OpenVINO are imported where they're first used, so the webcam
# demo can show its loading screen right away instead of a blank pause.

# Shown at the bottom right of the video. Bump by 1 with every change to the tracker.
VERSION = 23

HERE = Path(__file__).resolve().parent
MODEL_PATH = HERE / "yolov8n-pose.pt"  # downloaded here on first run
# OpenVINO copy of the model. Running it directly with OpenVINO is about twice
# as fast as PyTorch on Intel CPUs and skips loading PyTorch and Ultralytics,
# which took ~15 seconds at startup.
OPENVINO_PATH = HERE / "yolov8n-pose_openvino_model"
OPENVINO_XML = OPENVINO_PATH / "yolov8n-pose.xml"
OUTPUT_DIR = HERE / "output"
IMAGE_SIZE = 320
# Weapon detector trained with train/train_weapons.ipynb. Unzip the notebook's
# weapon_model.zip into this folder; without it, only people are tracked.
WEAPONS_ENABLED = False  # paused while general held-object detection is tuned
WEAPON_XML = HERE / "weapons_openvino_model" / "best.xml"
WEAPON_NAMES = ["gun", "knife"]  # same order as train/prepare_weapon_data.py
WEAPON_IMAGE_SIZE = 480  # full-frame weapon check; hand views below add close-up detail
WEAPON_CONF = 0.4  # minimum confidence to flag a possible weapon
WEAPON_COLOR = (0, 0, 255)  # BGR red
WEAPON_TEXT_COLOR = (80, 80, 255)  # lighter red, readable on the dark counter panel
# Held items are often small in the full frame, so both models also run on a
# zoomed-in square around each hand. Hands come from MediaPipe's hand tracker
# (works even when only a hand is in view) and from the body skeleton.
MAX_HANDS = 4
HAND_VIEW_SCALE = 4  # zoomed view's side, as a multiple of the hand's size
HAND_CROP_MIN = 160  # smallest zoomed view, in pixels
HAND_IMAGE_SIZE = 320  # the zoomed view is small, so the models can run at 320
HAND_WEAPON_CONF = 0.4  # minimum confidence for a weapon seen in a hand view
POSE_HAND_SIZE = 0.08  # skeleton-only hands: assumed size, as a fraction of body height
# Everyday objects (phones, cups, bottles...) come from the standard COCO model,
# run only on the hand views to see what people are holding.
OBJECT_PATH = HERE / "yolov8n.pt"  # downloaded here on first run
OBJECT_XML = HERE / "yolov8n_openvino_model" / "yolov8n.xml"
OBJECT_CONF = 0.35  # confidence needed to start treating something as held
OBJECT_KEEP_CONF = 0.2  # lower bar to keep following an object already held
OBJECT_IMAGE_SIZE = 416  # full-frame check for everyday objects
HOLDABLE = {
    "backpack", "umbrella", "handbag", "suitcase", "frisbee", "sports ball", "kite",
    "baseball bat", "baseball glove", "skateboard", "tennis racket", "bottle",
    "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
    "laptop", "mouse", "remote", "keyboard", "cell phone", "book", "clock", "vase",
    "scissors", "teddy bear", "hair drier", "toothbrush",
}
# Shapes the model often mistakes for a hand or fist (round things, odd
# outlines) need much more certainty before they count as held.
LOOKS_LIKE_HAND = {
    "sports ball", "apple", "orange", "donut", "cake", "kite", "frisbee", "teddy bear",
    "baseball glove", "baseball bat", "tennis racket", "bowl", "clock", "vase",
    "pizza", "sandwich", "hot dog", "broccoli", "carrot", "banana",
}
LOOKS_LIKE_HAND_CONF = 0.6
HELD_MARGIN = 0.2  # a hand this close to an object (fraction of its size) is holding it
HELD_COLOR = (255, 255, 0)  # BGR cyan
MERGE_IOU = 0.5  # detections of the same kind this close are one item
# The full-frame check and each hand view can all find the same weapon, with
# boxes that overlap only partly or sit inside one another; they count as one.
WEAPON_MERGE_IOU = 0.1
INSIDE_FRACTION = 0.7  # a held-object box mostly inside another is part of the same object
ITEM_HOLD = 3  # keep showing an item for this many detections after it's last seen
RELEASE_AFTER = 3  # detections with hands visible but away from an object before it's let go
DETECT_CONF = 0.5  # minimum YOLO confidence to count as a person (posters scored ~0.35)
NMS_IOU = 0.7  # overlapping boxes above this are treated as the same person
TRACK_IOU = 0.3  # how much a box must overlap last frame's to be the same person
TRACK_MAX_MISSES = 15  # forget a person after this many detections without them
CAMERA_WARMUP_SECONDS = 8  # macOS cameras can take ~4s to send their first frame
WINDOW = "WatchDog tracking - press q to quit"
# The webcam is read at full HD; detection and display run on a 640-wide copy,
# but the zoomed-in hand views are cut from the full-resolution frame so held
# objects get twice the detail.
CAMERA_SIZE = (1280, 720)
WORK_WIDTH = 640

BOX_COLOR = (0, 255, 255)  # BGR yellow
BONE_COLOR = (255, 255, 255)  # BGR white
FONT = cv2.FONT_HERSHEY_SIMPLEX
TAG_FONT_SCALE = 0.35  # labels on boxes
COUNTER_FONT_SCALE = 0.42  # PEOPLE / HELD OBJECTS in the top corners
LOADING_FONT_SCALE = 0.32
OVERLAY_ALPHA = 0.22  # strength of the box shading, body fill and glow
KEYPOINT_MIN_CONF = 0.5  # hide joints the model can't see clearly
CROP_PADDING = 0.15  # extra room around each box so limbs aren't cut off
MIN_CROP_HEIGHT = 80  # people smaller than this get YOLO's simpler skeleton
STALE_FRAMES = 30  # drop a person's pose tracker after this many missed detections
# MediaPipe's pose tracker can drift and lose the hands for good (it reuses the
# last frame's body position, and our person crops shift every frame). If it
# loses both hands for this many detections in a row, restart it from scratch.
POSE_RESET_AFTER = 2
# Skeleton and box smoothing ("One Euro" filter): heavy smoothing when still
# (no wobble), light smoothing when moving fast (no lag).
SMOOTH_MIN_CUTOFF = 1.5  # Hz; lower = steadier when still
SMOOTH_BETA = 0.04  # how quickly smoothing backs off as movement speeds up
SMOOTH_D_CUTOFF = 1.0  # Hz; smoothing of the speed estimate itself
# Between detector updates (a few per second), boxes and joints are moved along
# with the video using optical flow, so they keep up at the camera's frame rate.
# Held-object checks are capped so the skeleton gets most of the CPU; their
# boxes still move with the video every frame through optical flow.
ITEMS_MAX_RATE = 4  # held-object updates per second
FLOW_SCALE = 0.5  # optical flow runs on a half-size grayscale frame
FLOW_GRID = 4  # sample a 4x4 grid of points inside each box to measure its motion
FLOW_MAX_JOINT_DRIFT = 20  # a joint whose own flow differs more than this follows its body
# Finger points are too small to track reliably on their own; they move with their wrist.
FINGERS = {17: 15, 19: 15, 21: 15, 18: 16, 20: 16, 22: 16}
# An "object" that is really just a hand or a head (e.g. a fist) isn't counted.
SELF_IOU = 0.4  # overlap with a hand or head box that means it's the hand/head itself
SELF_INSIDE = 0.85  # or: this much of the object lies within the (slightly enlarged) hand
SELF_MAX_AREA = 2.5  # ...and the object isn't much bigger than the hand

# MediaPipe's 33 pose landmarks. Left/right are the person's own sides.
NOSE = 0
L_EYE_INNER, L_EYE, L_EYE_OUTER = 1, 2, 3
R_EYE_INNER, R_EYE, R_EYE_OUTER = 4, 5, 6
L_EAR, R_EAR = 7, 8
MOUTH_L, MOUTH_R = 9, 10
L_SHOULDER, R_SHOULDER = 11, 12
L_HIP, R_HIP = 23, 24
HANDS = ((15, 17, 19, 21), (16, 18, 20, 22))  # wrist, pinky, index, thumb (left, right)
NUM_LANDMARKS = 33

BONES = [
    (11, 13), (13, 15), (12, 14), (14, 16),  # arms
    (15, 17), (15, 19), (17, 19), (15, 21),  # left hand
    (16, 18), (16, 20), (18, 20), (16, 22),  # right hand
    (11, 12), (23, 24), (11, 23), (12, 24),  # torso
    (23, 25), (25, 27), (24, 26), (26, 28),  # legs
    (27, 29), (29, 31), (27, 31),  # left foot
    (28, 30), (30, 32), (28, 32),  # right foot
]
HEAD_POINTS = (NOSE, L_EYE_INNER, L_EYE, L_EYE_OUTER, R_EYE_INNER, R_EYE, R_EYE_OUTER, L_EAR, R_EAR)
FACE_POINTS = set(HEAD_POINTS) | {MOUTH_L, MOUTH_R}

# YOLO's 17 COCO keypoints, mapped onto the MediaPipe numbering above. Used
# when MediaPipe can't find a pose (e.g. someone small in the distance).
COCO_TO_MEDIAPIPE = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]


class Person:
    def __init__(self, box, confidence, points, track_id=None):
        self.box = box  # (x1, y1, x2, y2)
        self.track_id = track_id
        self.confidence = confidence
        self.points = points  # NUM_LANDMARKS entries of (x, y), or None if not visible


class PoseEstimator:
    """Runs MediaPipe on each tracked person's crop.

    Each track ID gets its own MediaPipe instance so it can follow that person
    smoothly from frame to frame.
    """

    def __init__(self):
        self.trackers = {}  # track id -> [mediapipe Pose, last frame seen, detections without hands]
        self.detection_index = 0

    def _tracker(self, track_id):
        if track_id not in self.trackers:
            import mediapipe as mp

            pose = mp.solutions.pose.Pose(
                static_image_mode=False,
                model_complexity=0,
            )
            self.trackers[track_id] = [pose, self.detection_index, 0]
        entry = self.trackers[track_id]
        entry[1] = self.detection_index
        return entry[0]

    def _forget_stale(self):
        for track_id, (pose, last_seen, _) in list(self.trackers.items()):
            if self.detection_index - last_seen > STALE_FRAMES:
                pose.close()
                del self.trackers[track_id]

    def estimate(self, frame, track_id, box):
        """Return one person's landmarks, or None if MediaPipe can't find a pose."""
        height, width = frame.shape[:2]
        x1, y1, x2, y2 = box
        pad_x = int((x2 - x1) * CROP_PADDING)
        pad_y = int((y2 - y1) * CROP_PADDING)
        cx1, cy1 = max(x1 - pad_x, 0), max(y1 - pad_y, 0)
        cx2, cy2 = min(x2 + pad_x, width), min(y2 + pad_y, height)
        if cy2 - cy1 < MIN_CROP_HEIGHT or cx2 <= cx1:
            return None

        crop = cv2.cvtColor(frame[cy1:cy2, cx1:cx2], cv2.COLOR_BGR2RGB)
        result = self._tracker(track_id).process(crop)
        if result.pose_landmarks is None:
            return None

        crop_h, crop_w = crop.shape[:2]
        points = [
            (int(lm.x * crop_w) + cx1, int(lm.y * crop_h) + cy1)
            if lm.visibility >= KEYPOINT_MIN_CONF else None
            for lm in result.pose_landmarks.landmark
        ]
        self._reset_if_hands_lost(track_id, points)
        return points

    def _reset_if_hands_lost(self, track_id, points):
        entry = self.trackers[track_id]
        if any(points[i] is not None for hand in HANDS for i in hand):
            entry[2] = 0
            return
        entry[2] += 1
        if entry[2] >= POSE_RESET_AFTER:
            entry[0].close()
            del self.trackers[track_id]  # recreated fresh on the next detection

    def warm_up(self):
        """Load MediaPipe and run it once so the first real person isn't slow."""
        blank = np.zeros((480, 640, 3), np.uint8)
        self.estimate(blank, "warm-up", (0, 0, 640, 480))
        self.trackers.pop("warm-up")[0].close()

    def next_frame(self):
        self.detection_index += 1
        self._forget_stale()

    def close(self):
        for pose, *_ in self.trackers.values():
            pose.close()
        self.trackers.clear()


def parse_args():
    parser = argparse.ArgumentParser(description="CPU-only person tracking.")
    parser.add_argument("video", nargs="?", help="path to a video file")
    parser.add_argument("--webcam", action="store_true", help="use the webcam")
    parser.add_argument("--camera", type=int, default=0, help="webcam index (default 0)")
    parser.add_argument(
        "--skip",
        type=int,
        default=2,
        help="video files: run detection on every Nth frame (default 2; try 3 if it's slow)",
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="show body skeletons, found hands, and the zoomed-in views around them"
    )
    return parser.parse_args()


def pick_video_file():
    """Open a file-picker dialog, falling back to typing a path."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError:
        return clean_path(input("Path to video file: "))

    root = tk.Tk()
    root.withdraw()
    path = filedialog.askopenfilename(
        title="Choose a video",
        filetypes=[("Video files", "*.mp4 *.mov *.avi *.mkv *.m4v"), ("All files", "*.*")],
    )
    root.destroy()
    return path


def clean_path(text):
    # Handles paths dragged into Terminal, which come quoted or with "\ " for spaces.
    return text.strip().strip("'\"").replace("\\ ", " ")


def choose_source():
    print("Choose a source:")
    print("  1) Video file")
    print("  2) Webcam")
    while True:
        choice = input("Enter 1 or 2: ").strip()
        if choice in ("1", "2"):
            return choice


def yolo_points(xy, conf):
    """Convert YOLO's 17 keypoints into the 33-landmark layout."""
    points = [None] * NUM_LANDMARKS
    for coco_index, mp_index in enumerate(COCO_TO_MEDIAPIPE):
        if conf[coco_index] >= KEYPOINT_MIN_CONF:
            points[mp_index] = tuple(xy[coco_index])
    return points


def letterbox(frame, size):
    """Scale the frame into a padded size x size square, as YOLO expects.

    Returns the model input plus the scale and padding to map results back.
    """
    height, width = frame.shape[:2]
    scale = size / max(height, width)
    new_w, new_h = round(width * scale), round(height * scale)
    pad_x, pad_y = (size - new_w) // 2, (size - new_h) // 2
    canvas = np.full((size, size, 3), 114, np.uint8)
    canvas[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = cv2.resize(frame, (new_w, new_h))
    blob = cv2.dnn.blobFromImage(canvas, 1 / 255, swapRB=True)
    return blob, scale, pad_x, pad_y


def frame_box(xywh, frame_shape, scale, offset):
    """Map a model-space (x, y, w, h) box back to frame pixels as (x1, y1, x2, y2)."""
    height, width = frame_shape[:2]
    x, y, bw, bh = xywh
    x1, y1 = (np.array([x, y]) - offset) / scale
    x2, y2 = (np.array([x + bw, y + bh]) - offset) / scale
    return (
        int(max(x1, 0)), int(max(y1, 0)),
        int(min(x2, width - 1)), int(min(y2, height - 1)),
    )


def decode(output, frame_shape, scale, pad_x, pad_y):
    """Turn YOLO pose output into [(box, confidence, keypoint_xy, keypoint_conf), ...].

    Each of the model's candidates is a row of: center x, center y, width,
    height, person confidence, then 17 keypoints as (x, y, visibility).
    """
    rows = output[0].T
    rows = rows[rows[:, 4] >= DETECT_CONF]
    if len(rows) == 0:
        return []

    cx, cy, w, h = rows[:, 0], rows[:, 1], rows[:, 2], rows[:, 3]
    xywh = np.stack([cx - w / 2, cy - h / 2, w, h], axis=1)
    keep = cv2.dnn.NMSBoxes(xywh.tolist(), rows[:, 4].tolist(), DETECT_CONF, NMS_IOU)

    offset = np.array([pad_x, pad_y])
    detections = []
    for i in np.array(keep).flatten():
        box = frame_box(xywh[i], frame_shape, scale, offset)
        keypoints = rows[i, 5:].reshape(17, 3)
        xy = ((keypoints[:, :2] - offset) / scale).astype(int).tolist()
        detections.append((box, float(rows[i, 4]), xy, keypoints[:, 2].tolist()))
    return detections


class Item:
    """Something found in the frame: a possible weapon or an everyday object."""

    def __init__(self, box, name, confidence, weapon):
        self.box = box  # (x1, y1, x2, y2)
        self.name = name
        self.confidence = confidence
        self.weapon = weapon
        self.held = False
        # Confidence needed before this starts counting as a held object.
        self.start_conf = LOOKS_LIKE_HAND_CONF if name in LOOKS_LIKE_HAND else OBJECT_CONF

    def scaled(self, factor):
        self.box = tuple(int(v * factor) for v in self.box)
        return self

    def shifted(self, dx, dy):
        x1, y1, x2, y2 = self.box
        self.box = (x1 + dx, y1 + dy, x2 + dx, y2 + dy)
        return self


def decode_items(output, frame_shape, scale, pad_x, pad_y, min_conf, names, weapon):
    """Turn YOLO detection output into a list of Item.

    Each candidate is a row of: center x, center y, width, height, then one
    confidence per class. For everyday objects, only HOLDABLE kinds are kept.
    """
    rows = output[0].T
    scores = rows[:, 4:]
    classes = scores.argmax(axis=1)
    confidences = scores.max(axis=1)
    keep = confidences >= min_conf
    if not weapon:
        keep &= np.isin(classes, [i for i, name in names.items() if name in HOLDABLE])
    rows, classes, confidences = rows[keep], classes[keep], confidences[keep]
    if len(rows) == 0:
        return []

    cx, cy, w, h = rows[:, 0], rows[:, 1], rows[:, 2], rows[:, 3]
    xywh = np.stack([cx - w / 2, cy - h / 2, w, h], axis=1)
    picked = cv2.dnn.NMSBoxesBatched(
        xywh.tolist(), confidences.tolist(), classes.tolist(), min_conf, NMS_IOU
    )
    offset = np.array([pad_x, pad_y])
    return [
        Item(
            frame_box(xywh[i], frame_shape, scale, offset),
            names[int(classes[i])],
            float(confidences[i]),
            weapon,
        )
        for i in np.array(picked).flatten()
    ]


class HandFinder:
    """Finds hands anywhere in the frame with MediaPipe's hand tracker."""

    def __init__(self):
        import mediapipe as mp

        self.hands = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=MAX_HANDS,
            model_complexity=0,
            min_detection_confidence=0.5,
        )

    def find(self, frame):
        """Return a (x1, y1, x2, y2) box for each hand."""
        height, width = frame.shape[:2]
        result = self.hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        boxes = []
        for hand in result.multi_hand_landmarks or []:
            xs = [lm.x * width for lm in hand.landmark]
            ys = [lm.y * height for lm in hand.landmark]
            boxes.append((int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))))
        return boxes

    def close(self):
        self.hands.close()


def pose_hands(person):
    """A small box around each hand the body skeleton can see."""
    _, top, _, bottom = person.box
    half = max(int((bottom - top) * POSE_HAND_SIZE / 2), 8)
    boxes = []
    for hand in HANDS:
        points = [person.points[i] for i in hand if person.points[i] is not None]
        if points:
            cx = sum(x for x, _ in points) // len(points)
            cy = sum(y for _, y in points) // len(points)
            boxes.append((cx - half, cy - half, cx + half, cy + half))
    return boxes


def center(box):
    return ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2)


def contains(box, point):
    return box[0] <= point[0] <= box[2] and box[1] <= point[1] <= box[3]


def hand_view(hand, frame_shape):
    """A square (x1, y1, x2, y2) zoomed-in region centered on a hand."""
    height, width = frame_shape[:2]
    size = max(hand[2] - hand[0], hand[3] - hand[1])
    side = min(max(size * HAND_VIEW_SCALE, HAND_CROP_MIN), width, height)
    cx, cy = center(hand)
    x1 = min(max(cx - side // 2, 0), width - side)
    y1 = min(max(cy - side // 2, 0), height - side)
    return x1, y1, x1 + side, y1 + side


def hand_views(hands, frame_shape):
    """Zoomed-in regions to check, skipping hands already inside an earlier view."""
    views = []
    for hand in sorted(hands, key=lambda h: h[2] - h[0], reverse=True):
        if not any(contains(view, center(hand)) and contains(view, hand[:2]) and contains(view, hand[2:])
                   for view in views):
            views.append(hand_view(hand, frame_shape))
    return views


def is_held(item, hands):
    """True if any hand touches the item's box (allowing a small margin)."""
    x1, y1, x2, y2 = item.box
    margin = HELD_MARGIN * max(x2 - x1, y2 - y1)
    return any(
        hx1 <= x2 + margin and hx2 >= x1 - margin and hy1 <= y2 + margin and hy2 >= y1 - margin
        for hx1, hy1, hx2, hy2 in hands
    )


def dedupe(items):
    """Keep the most confident of same-named items that overlap."""
    if len(items) < 2:
        return items
    names = sorted({item.name for item in items})
    keep = cv2.dnn.NMSBoxesBatched(
        [[i.box[0], i.box[1], i.box[2] - i.box[0], i.box[3] - i.box[1]] for i in items],
        [item.confidence for item in items],
        [names.index(item.name) for item in items],
        0,
        MERGE_IOU,
    )
    return [items[i] for i in np.array(keep).flatten()]


def merge_weapons(items):
    """One box per weapon: the most confident of any that overlap."""
    kept = []
    for w in sorted((i for i in items if i.weapon), key=lambda i: i.confidence, reverse=True):
        if not any(
            iou(w.box, k.box) > WEAPON_MERGE_IOU
            or fraction_inside(w.box, k.box) > INSIDE_FRACTION
            or fraction_inside(k.box, w.box) > INSIDE_FRACTION
            for k in kept
        ):
            kept.append(w)
    return kept


def merge_items(items):
    """Combine full-frame and hand-view finds into one list without duplicates.

    When the weapon model and the everyday model see the same thing (e.g. a
    knife), the weapon flag wins.
    """
    weapons = merge_weapons(items)
    # The type of an everyday object isn't shown, so overlapping guesses
    # (e.g. "phone" and "remote" on the same thing) count as one object.
    objects = [i for i in items if not i.weapon]
    for o in objects:
        o.name = "object"
    objects = sorted(dedupe(objects), key=area, reverse=True)
    kept = []
    for o in objects:
        if not any(fraction_inside(o.box, k.box) > INSIDE_FRACTION for k in kept):
            kept.append(o)
    objects = [o for o in kept if not any(iou(o.box, w.box) > 0.3 for w in weapons)]
    return weapons + objects


def grow(box, factor):
    cx, cy = center(box)
    hw, hh = (box[2] - box[0]) * factor / 2, (box[3] - box[1]) * factor / 2
    return (int(cx - hw), int(cy - hh), int(cx + hw), int(cy + hh))


def head_box(person):
    shape = skeleton_shapes(person.points)[1]
    if shape is None:
        return None
    (cx, cy), radius = shape
    return (cx - radius, cy - radius, cx + radius, cy + radius)


def is_body_part(item, hand_boxes, people):
    """True if a detected "object" is really someone's hand (e.g. a fist) or head."""
    box = item.box
    for hand in hand_boxes:
        hand_area = (hand[2] - hand[0]) * (hand[3] - hand[1])
        if iou(box, hand) > SELF_IOU:
            return True
        if fraction_inside(box, grow(hand, 1.25)) > SELF_INSIDE and area(item) < SELF_MAX_AREA * hand_area:
            return True
    heads = [head_box(person) for person in people]
    return any(head is not None and iou(box, head) > SELF_IOU for head in heads)


class ItemTracker:
    """Follows items from one detection to the next so they don't flicker.

    Once something is seen in a hand, it stays "held" while it's still in view,
    even if the hands drop out for a moment (fingers wrapped around an object
    are hard to detect). It's let go only when hands are visible but away from
    it, or when the object itself has been gone for a few detections.
    """

    def __init__(self):
        self.tracks = []  # [Item, detections missed, detections with hands away]

    def update(self, found, hands):
        unmatched = list(found)
        for track in self.tracks:
            match = next((f for f in unmatched if same_item(track[0], f)), None)
            if match is not None:
                unmatched.remove(match)
                track[0], track[1] = match, 0
            else:
                track[1] += 1

        for item in unmatched:
            if item.weapon or (item.confidence >= item.start_conf and is_held(item, hands)):
                self.tracks.append([item, 0, 0])

        kept = []
        for track in self.tracks:
            item = track[0]
            item.held = is_held(item, hands)
            if not item.weapon:
                if item.held:
                    track[2] = 0
                elif hands:
                    track[2] += 1
                item.held = track[2] < RELEASE_AFTER
            if track[1] < ITEM_HOLD and (item.weapon or item.held):
                kept.append(track)
        self.tracks = kept
        return [track[0] for track in self.tracks]


def same_item(a, b):
    """Whether two detections (e.g. from consecutive frames) are the same item."""
    return a.weapon == b.weapon and (
        iou(a.box, b.box) > 0.2
        or fraction_inside(a.box, b.box) > INSIDE_FRACTION
        or fraction_inside(b.box, a.box) > INSIDE_FRACTION
    )


def area(item):
    x1, y1, x2, y2 = item.box
    return (x2 - x1) * (y2 - y1)


def fraction_inside(a, b):
    """How much of box a lies inside box b (0 to 1)."""
    ix = max(min(a[2], b[2]) - max(a[0], b[0]), 0)
    iy = max(min(a[3], b[3]) - max(a[1], b[1]), 0)
    size = (a[2] - a[0]) * (a[3] - a[1])
    return ix * iy / size if size > 0 else 0


def iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(ix2 - ix1, 0) * max(iy2 - iy1, 0)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0


class BoxTracker:
    """Gives each person a stable internal ID by matching overlapping boxes.

    IDs aren't shown; they let each person keep their own pose tracker and
    smoothing from one detection to the next.
    """

    def __init__(self):
        self.tracks = {}  # id -> [last box, detections missed]
        self.next_id = 1

    def update(self, boxes):
        pairs = sorted(
            ((iou(box, track[0]), d, t) for d, box in enumerate(boxes)
             for t, track in self.tracks.items()),
            reverse=True,
        )
        ids = [None] * len(boxes)
        matched = set()
        for overlap, d, t in pairs:
            if overlap < TRACK_IOU:
                break
            if ids[d] is None and t not in matched:
                ids[d] = t
                matched.add(t)

        for t in list(self.tracks):
            if t not in matched:
                self.tracks[t][1] += 1
                if self.tracks[t][1] > TRACK_MAX_MISSES:
                    del self.tracks[t]
        for d, box in enumerate(boxes):
            if ids[d] is None:
                ids[d] = self.next_id
                self.next_id += 1
            self.tracks[ids[d]] = [box, 0]
        return ids


def get_people(frame, detections, ids, estimator):
    """Return a Person for each detection, with MediaPipe's pose when it finds one."""
    estimator.next_frame()
    people = []
    for (box, confidence, kp_xy, kp_conf), track_id in zip(detections, ids):
        points = estimator.estimate(frame, track_id, box)
        if points is None:
            points = yolo_points(kp_xy, kp_conf)
        people.append(Person(box, confidence, points, track_id))
    return people


def midpoint(a, b):
    if a is None or b is None:
        return None
    return ((a[0] + b[0]) // 2, (a[1] + b[1]) // 2)


def draw_corners(frame, box, color):
    """Thick corner brackets, like a camera's focus frame."""
    x1, y1, x2, y2 = box
    length = max(min(x2 - x1, y2 - y1) // 6, 8)
    for x, y, dx, dy in ((x1, y1, 1, 1), (x2, y1, -1, 1), (x1, y2, 1, -1), (x2, y2, -1, -1)):
        cv2.line(frame, (x, y), (x + dx * length, y), color, 3, cv2.LINE_AA)
        cv2.line(frame, (x, y), (x, y + dy * length), color, 3, cv2.LINE_AA)


def skeleton_shapes(points):
    """Return (bones, head, joints) to draw; head is (center, radius) or None."""
    neck = midpoint(points[L_SHOULDER], points[R_SHOULDER])
    pelvis = midpoint(points[L_HIP], points[R_HIP])
    spine = midpoint(neck, pelvis)

    bones = [(points[a], points[b]) for a, b in BONES]
    bones += [(neck, spine), (spine, pelvis)]

    head = None
    head_points = [points[i] for i in HEAD_POINTS if points[i] is not None]
    if head_points:
        n = len(head_points)
        center = (sum(x for x, _ in head_points) // n, sum(y for _, y in head_points) // n)
        xs = [x for x, _ in head_points]
        radius = max(int((max(xs) - min(xs)) * 0.6), 8)
        head = (center, radius)
        if neck is not None:
            bones.append(((center[0], center[1] + radius), neck))

    bones = [(a, b) for a, b in bones if a is not None and b is not None]
    joints = [p for i, p in enumerate(points) if p is not None and i not in FACE_POINTS]
    joints += [p for p in (neck, spine, pelvis) if p is not None]
    return bones, head, joints


def draw_people(frame, people, skeletons):
    """Person boxes; the skeletons too when asked (--debug).

    Skeletons are still found either way: they locate hands for the
    zoomed-in held-object checks.
    """
    shapes = [skeleton_shapes(person.points) if skeletons else ([], None, []) for person in people]

    # Box shading and the skeleton's soft glow go on a copy that's blended
    # back in, so they're see-through.
    glow = frame.copy()
    for person, (bones, head, _) in zip(people, shapes):
        x1, y1, x2, y2 = person.box
        cv2.rectangle(glow, (x1, y1), (x2, y2), BOX_COLOR, -1)
        for a, b in bones:
            cv2.line(glow, a, b, BONE_COLOR, 7, cv2.LINE_AA)
        if head is not None:
            cv2.circle(glow, head[0], head[1], BONE_COLOR, 6, cv2.LINE_AA)
    cv2.addWeighted(glow, OVERLAY_ALPHA, frame, 1 - OVERLAY_ALPHA, 0, dst=frame)

    # Crisp lines on top.
    for person, (bones, head, joints) in zip(people, shapes):
        for a, b in bones:
            cv2.line(frame, a, b, BONE_COLOR, 2, cv2.LINE_AA)
        if head is not None:
            cv2.circle(frame, head[0], head[1], BONE_COLOR, 2, cv2.LINE_AA)
        for joint in joints:
            cv2.circle(frame, joint, 4, BONE_COLOR, 1, cv2.LINE_AA)
            cv2.circle(frame, joint, 2, BONE_COLOR, -1, cv2.LINE_AA)

        x1, y1, x2, y2 = person.box
        cv2.rectangle(frame, (x1, y1), (x2, y2), BOX_COLOR, 1, cv2.LINE_AA)
        draw_corners(frame, person.box, BOX_COLOR)
        draw_tag(frame, x1, y1, f"PERSON {person.confidence:.0%}", BOX_COLOR, (0, 0, 0))


def draw_tag(frame, x, y, label, color, text_color):
    """A small filled label sitting on top of a box's top-left corner."""
    (w, h), _ = cv2.getTextSize(label, FONT, TAG_FONT_SCALE, 1)
    top = max(y - h - 8, 0)
    x = min(x, frame.shape[1] - w - 8)  # keep the tag on screen
    cv2.rectangle(frame, (x, top), (x + w + 8, top + h + 6), color, -1)
    cv2.putText(frame, label, (x + 4, top + h + 3), FONT, TAG_FONT_SCALE, text_color, 1, cv2.LINE_AA)


def draw_items(frame, items):
    """Red boxes for possible weapons, cyan boxes for other held objects."""
    for item in items:
        if item.weapon:
            color, text_color = WEAPON_COLOR, (255, 255, 255)
            label = f"POSSIBLE {item.name.upper()} {item.confidence:.0%}"
        else:
            # Don't guess what everyday objects are; just say something is held.
            color, text_color, label = HELD_COLOR, (0, 0, 0), "HOLDING OBJECT"
        x1, y1, x2, y2 = item.box
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)
        draw_corners(frame, item.box, color)
        draw_tag(frame, x1, y1, label, color, text_color)


def draw_counter(frame, text, right, row=0, color=(255, 255, 255)):
    """A small dark panel with text in the top-left or top-right corner.

    row stacks panels downward: 0 is the top one, 1 sits just below it, ...
    """
    (w, h), _ = cv2.getTextSize(text, FONT, COUNTER_FONT_SCALE, 1)
    (_, row_h), _ = cv2.getTextSize("A", FONT, COUNTER_FONT_SCALE, 1)  # same height every row
    x1 = frame.shape[1] - w - 26 if right else 10
    y1 = 10 + row * (row_h + 20)
    x2, y2 = x1 + w + 16, y1 + row_h + 14
    panel = frame[y1:y2, x1:x2]
    panel[:] = (panel * 0.35).astype(np.uint8)  # darken behind the text
    cv2.putText(frame, text, (x1 + 8, y1 + row_h + 7), FONT, COUNTER_FONT_SCALE, color, 1, cv2.LINE_AA)


def draw_counts(frame, people, items):
    draw_counter(frame, f"PEOPLE: {len(people)}", right=False)
    draw_counter(frame, f"HELD OBJECTS: {sum(item.held for item in items)}", right=True)
    weapon = any(item.weapon for item in items)
    draw_counter(frame, f"WEAPON DETECTED: {str(weapon).upper()}", right=True, row=1,
                 color=WEAPON_TEXT_COLOR if weapon else (255, 255, 255))
    # Placeholder: the alert's overall confidence isn't calculated yet.
    draw_counter(frame, "CONFIDENCE: --", right=True, row=2)


def draw_version(frame):
    text = f"v{VERSION}"
    (w, _), _ = cv2.getTextSize(text, FONT, TAG_FONT_SCALE, 1)
    height, width = frame.shape[:2]
    cv2.putText(frame, text, (width - w - 10, height - 10), FONT, TAG_FONT_SCALE, (200, 200, 200), 1, cv2.LINE_AA)


def draw_hand_views(frame, hands):
    """--debug: outline each hand found and the zoomed-in view checked around it."""
    for x1, y1, x2, y2 in hand_views(hands, frame.shape):
        cv2.rectangle(frame, (x1, y1), (x2, y2), (160, 160, 160), 1)
    for x1, y1, x2, y2 in hands:
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 200, 0), 1)


def draw_overlay(frame, people, items, hands, debug):
    draw_people(frame, people, skeletons=debug)
    if debug:
        draw_hand_views(frame, hands)
    draw_items(frame, items)
    draw_counts(frame, people, items)
    draw_version(frame)


def flow_gray(frame):
    small = cv2.resize(frame, None, fx=FLOW_SCALE, fy=FLOW_SCALE, interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)


def box_grid(box):
    """FLOW_GRID x FLOW_GRID points spread inside a box."""
    x1, y1, x2, y2 = box
    xs = np.linspace(x1, x2, FLOW_GRID + 2)[1:-1]
    ys = np.linspace(y1, y2, FLOW_GRID + 2)[1:-1]
    return [(x, y) for y in ys for x in xs]


class MotionFollower:
    """Moves boxes and skeletons with the video between detector updates.

    A detector's newest result describes a frame that's already a little old.
    Optical flow measures how the picture moved since then, and the overlay is
    shifted to match, on every frame the camera sends.
    """

    def __init__(self):
        self.gray = None
        self.things = []  # copies of the newest People or Items, moved along
        self.result_id = None

    def update(self, gray, things, result_gray, result_id):
        if result_id != self.result_id:
            # A new detection: start from it, measured from the frame it came from.
            self.result_id = result_id
            self.things = [copy_thing(t) for t in things]
            previous = result_gray
        else:
            previous = self.gray
        if previous is not None and self.things:
            self._follow(previous, gray)
        self.gray = gray
        return self.things

    def _follow(self, previous, gray):
        # Each box's motion is the median motion of a grid of points inside it.
        grids = [box_grid(t.box) for t in self.things]
        motion, ok = flow(previous, gray, [p for g in grids for p in g], 15)
        shifts, first = [], 0
        for grid in grids:
            good = motion[first:first + len(grid)][ok[first:first + len(grid)]]
            shifts.append(np.median(good, axis=0) if len(good) else np.zeros(2))
            first += len(grid)
        for thing, (dx, dy) in zip(self.things, shifts):
            x1, y1, x2, y2 = thing.box
            thing.box = (int(x1 + dx), int(y1 + dy), int(x2 + dx), int(y2 + dy))

        people = [(t, shift) for t, shift in zip(self.things, shifts) if isinstance(t, Person)]
        joints = [
            (person, i, body) for person, body in people
            for i, point in enumerate(person.points) if point is not None and i not in FINGERS
        ]
        if not joints:
            return
        motion, ok = flow(previous, gray, [person.points[i] for person, i, _ in joints], 21)
        for (person, i, body), own, good in zip(joints, motion, ok):
            # A joint follows its own motion (an arm swinging) unless that
            # reading is unreliable, in which case it moves with the body.
            if not good or np.abs(own - body).max() > FLOW_MAX_JOINT_DRIFT:
                own = body
            x, y = person.points[i]
            person.points[i] = (int(x + own[0]), int(y + own[1]))
            for finger, wrist in FINGERS.items():
                if wrist == i and person.points[finger] is not None:
                    fx, fy = person.points[finger]
                    person.points[finger] = (int(fx + own[0]), int(fy + own[1]))


def flow(previous, gray, points, window):
    """Optical flow of points (full-size coordinates) -> (motion per point, ok per point)."""
    start = np.float32(points).reshape(-1, 1, 2) * FLOW_SCALE
    moved, status, _ = cv2.calcOpticalFlowPyrLK(
        previous, gray, start, None, winSize=(window, window), maxLevel=3
    )
    return (moved - start).reshape(-1, 2) / FLOW_SCALE, status.reshape(-1).astype(bool)


def copy_thing(thing):
    if isinstance(thing, Person):
        return Person(thing.box, thing.confidence, list(thing.points), thing.track_id)
    return copy_item(thing)


def copy_item(item):
    copy = Item(item.box, item.name, item.confidence, item.weapon)
    copy.held = item.held
    return copy


class Smoother:
    """Smooths each person's box and joints with a One Euro filter.

    The filter adapts to speed: when a point is nearly still it's smoothed
    heavily (no wobble), and when it moves quickly it's barely smoothed (no lag).
    """

    def __init__(self):
        self.state = {}  # track id -> (values, speeds, time)

    def update(self, people, now=None):
        now = time.monotonic() if now is None else now
        state, result = {}, []
        for person in people:
            values = person_values(person)
            old = self.state.get(person.track_id)
            if old is None:
                smoothed, speeds = values, np.zeros_like(values)
            else:
                smoothed, speeds = one_euro(values, *old, now)
            state[person.track_id] = (smoothed, speeds, now)
            result.append(values_person(person, smoothed))
        self.state = state
        return result


def person_values(person):
    """Box and joints as one float array; hidden joints are NaN."""
    joints = [p if p is not None else (np.nan, np.nan) for p in person.points]
    return np.array(list(person.box) + [c for p in joints for c in p], dtype=float)


def values_person(person, values):
    box = tuple(int(v) for v in values[:4])
    joints = values[4:].reshape(-1, 2)
    points = [None if np.isnan(x) else (int(x), int(y)) for x, y in joints]
    return Person(box, person.confidence, points, person.track_id)


def one_euro(values, last, last_speed, last_time, now):
    dt = max(now - last_time, 1e-3)

    def alpha(cutoff):
        return 1 / (1 + 1 / (2 * np.pi * cutoff * dt))

    fresh = np.isnan(last) | np.isnan(values)  # joint just appeared or disappeared
    last = np.where(fresh, values, last)
    speed = (values - last) / dt
    speed = last_speed + alpha(SMOOTH_D_CUTOFF) * (np.nan_to_num(speed) - last_speed)
    a = alpha(SMOOTH_MIN_CUTOFF + SMOOTH_BETA * np.abs(speed))
    smoothed = np.where(fresh, values, last + a * (values - last))
    return smoothed, np.where(fresh, 0, speed)


def open_webcam(index):
    cap = cv2.VideoCapture(index)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_SIZE[0])
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_SIZE[1])
    if not cap.isOpened():
        sys.exit(
            "Couldn't open the webcam. Allow camera access for Terminal in "
            "System Settings > Privacy & Security > Camera, then try again."
        )
    return cap


def loading_frame(elapsed):
    """A dark screen with a small spinning arc and "LOADING..." under it."""
    frame = np.full((360, 640, 3), 20, np.uint8)
    center, radius = (320, 165), 14
    angle = int(elapsed * 360) % 360
    cv2.circle(frame, center, radius, (50, 50, 50), 2, cv2.LINE_AA)
    cv2.ellipse(frame, center, (radius, radius), 0, angle, angle + 90, BOX_COLOR, 2, cv2.LINE_AA)

    # Center on the full "LOADING..." so the word doesn't shift as dots appear.
    (w, _), _ = cv2.getTextSize("LOADING...", FONT, LOADING_FONT_SCALE, 1)
    text = "LOADING" + "." * (int(elapsed * 2) % 4)
    cv2.putText(frame, text, (320 - w // 2, 206), FONT, LOADING_FONT_SCALE, (255, 255, 255), 1, cv2.LINE_AA)
    return frame


def load_for_webcam(cap):
    """Show a loading screen while the camera warms up and the models load.

    Returns a ready Detector, or None if the user pressed q.
    """
    loaded = {}

    def load():
        try:
            # MediaPipe takes ~3s to import; do it alongside loading YOLO.
            mediapipe_import = threading.Thread(target=__import__, args=("mediapipe",))
            mediapipe_import.start()
            detector = Detector()
            mediapipe_import.join()
            detector.warm_up()
            loaded["detector"] = detector
        except Exception as error:
            loaded["error"] = error

    threading.Thread(target=load, daemon=True).start()
    started = time.monotonic()
    camera_ready = False
    while not (camera_ready and "detector" in loaded):
        if "error" in loaded:
            raise loaded["error"]
        if not camera_ready:
            camera_ready = cap.read()[0]
            if not camera_ready and time.monotonic() - started > CAMERA_WARMUP_SECONDS:
                sys.exit(
                    "The webcam opened but sent no frames. Close other apps using the "
                    "camera (FaceTime, Zoom, Photo Booth) and try again."
                )
        cv2.imshow(WINDOW, loading_frame(time.monotonic() - started))
        if cv2.waitKey(30) & 0xFF == ord("q"):
            return None
    return loaded["detector"]


def openvino_model(pt_path, xml_path, **export_args):
    """Compile an OpenVINO model, converting it from PyTorch on first use."""
    if not xml_path.exists():
        # One-time conversion. This is the only place PyTorch and Ultralytics load.
        from ultralytics import YOLO, settings

        settings.update({"sync": False})
        print(f"Converting {pt_path.name} for faster CPU inference (first run only)...")
        YOLO(str(pt_path)).export(format="openvino", **export_args)

    import openvino as ov

    return ov.Core().compile_model(str(xml_path), "CPU", {"PERFORMANCE_HINT": "LATENCY"})


def model_names(xml_path):
    import yaml

    with open(xml_path.parent / "metadata.yaml") as f:
        return {int(k): v for k, v in yaml.safe_load(f)["names"].items()}


class Detector:
    """Finds people, their poses, possible weapons, and what people are holding."""

    def __init__(self):
        self.model = openvino_model(MODEL_PATH, OPENVINO_XML, imgsz=IMAGE_SIZE)
        self.object_model = openvino_model(OBJECT_PATH, OBJECT_XML, dynamic=True)
        self.object_names = model_names(OBJECT_XML)
        self.weapon_model = None
        if WEAPONS_ENABLED and WEAPON_XML.exists():
            self.weapon_model = openvino_model(None, WEAPON_XML)
        elif WEAPONS_ENABLED:
            print("No weapon model found (see train/train_weapons.ipynb); not flagging weapons.")
        self.weapon_names = dict(enumerate(WEAPON_NAMES))
        self.hand_finder = None  # created on first use, after MediaPipe is imported
        self.items = ItemTracker()
        # Independent steps run side by side; MediaPipe and OpenVINO release
        # Python's lock while they work, so this uses more of the CPU's cores.
        self.pool = ThreadPoolExecutor(max_workers=2)
        self.tracker = BoxTracker()
        self.estimator = PoseEstimator()

    def detect(self, frame):
        """Return (people, items, hands) for one frame."""
        people = self.find_people(frame)
        items, hands = self.find_items(frame, people)
        return people, items, hands

    def find_people(self, frame):
        """People and their skeletons."""
        blob, scale, pad_x, pad_y = letterbox(frame, IMAGE_SIZE)
        output = self.model(blob)[0]
        detections = decode(output, frame.shape, scale, pad_x, pad_y)
        ids = self.tracker.update([box for box, *_ in detections])
        return get_people(frame, detections, ids, self.estimator)

    def find_items(self, frame, people, full=None):
        """(held objects and possible weapons, hand boxes) for one frame.

        full is the same frame at a higher resolution, if available; hand
        views are cut from it for extra detail.
        """
        if self.hand_finder is None:
            self.hand_finder = HandFinder()
        objects_job = self.pool.submit(self.find_objects, frame, OBJECT_IMAGE_SIZE)
        weapons_job = None
        if self.weapon_model is not None:
            weapons_job = self.pool.submit(self.find_weapons, frame, WEAPON_IMAGE_SIZE, WEAPON_CONF)

        found_hands = self.hand_finder.find(frame)
        # Skeleton hands fill in for hands the hand tracker missed.
        hands = found_hands + [
            hand for person in people for hand in pose_hands(person)
            if not any(contains(h, center(hand)) for h in found_hands)
        ]

        items = objects_job.result()
        if weapons_job is not None:
            items += weapons_job.result()

        # Zoom in around hands: held things are often small in the full frame.
        source = frame if full is None else full
        zoom = source.shape[1] / frame.shape[1]
        for x1, y1, x2, y2 in hand_views(hands, frame.shape):
            crop = source[int(y1 * zoom):int(y2 * zoom), int(x1 * zoom):int(x2 * zoom)]
            found = self.find_objects(crop, HAND_IMAGE_SIZE)
            if self.weapon_model is not None:
                found += self.find_weapons(crop, HAND_IMAGE_SIZE, HAND_WEAPON_CONF)
            items += [item.scaled(1 / zoom).shifted(x1, y1) for item in found]

        items = [
            item for item in merge_items(items)
            if item.weapon or not is_body_part(item, found_hands, people)
        ]
        return self.items.update(items, hands), hands

    def find_weapons(self, image, size, min_conf):
        return self.run(self.weapon_model, image, size, min_conf, self.weapon_names, weapon=True)

    def find_objects(self, image, size):
        return self.run(
            self.object_model, image, size, OBJECT_KEEP_CONF, self.object_names, weapon=False
        )

    @staticmethod
    def run(model, image, size, min_conf, names, weapon):
        blob, scale, pad_x, pad_y = letterbox(image, size)
        output = model(blob)[0]
        return decode_items(output, image.shape, scale, pad_x, pad_y, min_conf, names, weapon)

    def warm_up(self):
        """Run every model once so the first live frames aren't slow."""
        blank = np.zeros((480, 640, 3), np.uint8)
        self.detect(blank)
        self.find_objects(blank[:HAND_CROP_MIN, :HAND_CROP_MIN], HAND_IMAGE_SIZE)
        if self.weapon_model is not None:
            self.find_weapons(blank[:HAND_CROP_MIN, :HAND_CROP_MIN], HAND_IMAGE_SIZE, HAND_WEAPON_CONF)
        self.estimator.warm_up()

    def close(self):
        self.pool.shutdown()
        self.estimator.close()
        if self.hand_finder is not None:
            self.hand_finder.close()


class BackgroundWorker(threading.Thread):
    """Runs one detection step on the newest webcam frame in the background.

    The video keeps playing at full camera speed while detection catches up;
    frames that arrive while it's busy are skipped rather than queued.
    """

    def __init__(self, step, max_rate=None):
        super().__init__(daemon=True)
        self.step = step
        self.min_interval = 1 / max_rate if max_rate else 0
        self.lock = threading.Lock()
        self.new_frame = threading.Event()
        self.frame = None
        self.result = None
        self.result_gray = None  # small grayscale copy of the frame the result is for
        self.result_id = 0  # goes up with each new result
        self.stopped = False

    def submit(self, frame, full=None):
        with self.lock:
            self.frame = (frame, full)
        self.new_frame.set()

    def latest(self):
        with self.lock:
            return self.result, self.result_gray, self.result_id

    def run(self):
        while not self.stopped:
            self.new_frame.wait()
            self.new_frame.clear()
            with self.lock:
                frames, self.frame = self.frame, None
            if frames is None or self.stopped:
                continue
            frame, full = frames
            started = time.monotonic()
            result = self.step(frame, full)
            gray = flow_gray(frame)
            with self.lock:
                self.result, self.result_gray = result, gray
                self.result_id += 1
            time.sleep(max(0, self.min_interval - (time.monotonic() - started)))

    def stop(self):
        self.stopped = True
        self.new_frame.set()
        self.join()


class LiveTracker:
    """The webcam pipeline: detection in the background, overlay at full frame rate.

    Skeletons and held objects run in separate background loops so the
    skeleton updates as often as it can without waiting on object detection.
    """

    def __init__(self, detector):
        self.detector = detector
        self.people_worker = BackgroundWorker(lambda frame, full: detector.find_people(frame))
        self.items_worker = BackgroundWorker(
            lambda frame, full: detector.find_items(frame, self.people_worker.latest()[0] or [], full),
            max_rate=ITEMS_MAX_RATE,
        )
        self.people_follower = MotionFollower()
        self.items_follower = MotionFollower()
        self.smoother = Smoother()
        self.people_worker.start()
        self.items_worker.start()

    def update(self, frame, full=None):
        """Return (people, items, hands) to draw on this frame.

        full is the same frame at a higher resolution, if available.
        """
        self.people_worker.submit(frame.copy())
        self.items_worker.submit(frame.copy(), None if full is None else full.copy())
        gray = flow_gray(frame)
        people, people_gray, people_id = self.people_worker.latest()
        found, items_gray, items_id = self.items_worker.latest()
        items, hands = found or ([], [])
        people = self.people_follower.update(gray, people or [], people_gray, people_id)
        items = self.items_follower.update(gray, items, items_gray, items_id)
        return self.smoother.update(people), items, hands

    def close(self):
        self.people_worker.stop()
        self.items_worker.stop()
        self.detector.close()


def work_size(frame):
    """Shrink a frame to WORK_WIDTH wide (no change if it's already that small)."""
    height, width = frame.shape[:2]
    if width <= WORK_WIDTH:
        return frame
    return cv2.resize(frame, (WORK_WIDTH, round(height * WORK_WIDTH / width)), interpolation=cv2.INTER_AREA)


def show(frame):
    """Display a frame; return False once the user presses q."""
    cv2.imshow(WINDOW, frame)
    return cv2.waitKey(1) & 0xFF != ord("q")


def run_webcam(cap, detector, debug):
    live = LiveTracker(detector)
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            full, frame = frame, work_size(frame)
            draw_overlay(frame, *live.update(frame, full), debug)
            if not show(frame):
                break
    finally:
        live.close()


def run_video(cap, writer, skip, debug):
    # Video files are processed frame by frame so the saved copy lines up exactly.
    detector = Detector()
    people, items, hands = [], [], []
    frame_index = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            # Detect on every Nth frame; reuse the last boxes and poses in between.
            if frame_index % skip == 0:
                people, items, hands = detector.detect(frame)

            draw_overlay(frame, people, items, hands, debug)
            writer.write(frame)
            if not show(frame):
                break
            frame_index += 1
    finally:
        detector.close()


def main():
    args = parse_args()
    if args.skip < 1:
        sys.exit("--skip must be 1 or more")

    if args.video:
        use_webcam = False
        video_path = clean_path(args.video)
    elif args.webcam:
        use_webcam = True
    else:
        use_webcam = choose_source() == "2"
        if not use_webcam:
            video_path = pick_video_file()

    writer = None
    if use_webcam:
        cap = open_webcam(args.camera)
    else:
        if not video_path:
            sys.exit("No video chosen.")
        video_path = Path(video_path).expanduser()
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            sys.exit(f"Couldn't open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        OUTPUT_DIR.mkdir(exist_ok=True)
        out_path = OUTPUT_DIR / f"{video_path.stem}_tracked.mp4"
        writer = cv2.VideoWriter(
            str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height)
        )
        print(f"Saving tracked video to {out_path}")

    print("Press q in the video window to quit.")
    try:
        if use_webcam:
            detector = load_for_webcam(cap)
            if detector is not None:
                print("Webcam running. Frames are shown only and never saved.")
                run_webcam(cap, detector, args.debug)
        else:
            run_video(cap, writer, args.skip, args.debug)
    finally:
        cap.release()
        if writer is not None:
            writer.release()
        cv2.destroyAllWindows()
        cv2.waitKey(1)  # lets macOS actually close the window


if __name__ == "__main__":
    main()
