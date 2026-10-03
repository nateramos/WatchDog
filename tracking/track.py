"""Lightweight, CPU-only person tracking for WatchDog.

Everything runs on this computer. People are found and tracked by box position
and motion (YOLO + ByteTrack), and each person's body pose comes from
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
from pathlib import Path

# Keep Ultralytics offline: no usage analytics or hub calls.
os.environ.setdefault("YOLO_OFFLINE", "1")
os.environ.setdefault("GLOG_minloglevel", "2")  # quiet MediaPipe's startup logs

import certifi

# MediaPipe downloads its pose model on first run with urllib, which can't find
# root certificates on python.org installs of Python for macOS.
os.environ.setdefault("SSL_CERT_FILE", certifi.where())

import cv2
import mediapipe as mp
from ultralytics import YOLO, settings

settings.update({"sync": False})

HERE = Path(__file__).resolve().parent
MODEL_PATH = HERE / "yolov8n-pose.pt"  # downloaded here on first run
# OpenVINO copy of the model: about twice as fast as PyTorch on Intel CPUs.
OPENVINO_PATH = HERE / "yolov8n-pose_openvino_model"
OUTPUT_DIR = HERE / "output"
PERSON_CLASS = 0
IMAGE_SIZE = 320
CAMERA_WARMUP_SECONDS = 8  # macOS cameras can take ~4s to send their first frame
WINDOW = "WatchDog tracking - press q to quit"

BOX_COLOR = (0, 255, 255)  # BGR yellow
BONE_COLOR = (255, 255, 255)  # BGR white
OVERLAY_ALPHA = 0.22  # strength of the box shading, body fill and glow
KEYPOINT_MIN_CONF = 0.5  # hide joints the model can't see clearly
CROP_PADDING = 0.15  # extra room around each box so limbs aren't cut off
MIN_CROP_HEIGHT = 80  # people smaller than this get YOLO's simpler skeleton
STALE_FRAMES = 30  # drop a person's pose tracker after this many missed detections
SMOOTHING = 0.5  # how far the drawn skeleton moves toward the newest pose each frame

# MediaPipe's 33 pose landmarks. Left/right are the person's own sides.
NOSE = 0
L_EYE_INNER, L_EYE, L_EYE_OUTER = 1, 2, 3
R_EYE_INNER, R_EYE, R_EYE_OUTER = 4, 5, 6
L_EAR, R_EAR = 7, 8
MOUTH_L, MOUTH_R = 9, 10
L_SHOULDER, R_SHOULDER = 11, 12
L_HIP, R_HIP = 23, 24
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
        self.trackers = {}  # track id -> (mediapipe Pose, last frame seen)
        self.detection_index = 0

    def _tracker(self, track_id):
        if track_id not in self.trackers:
            pose = mp.solutions.pose.Pose(
                static_image_mode=False,
                model_complexity=0,
            )
            self.trackers[track_id] = [pose, self.detection_index]
        entry = self.trackers[track_id]
        entry[1] = self.detection_index
        return entry[0]

    def _forget_stale(self):
        for track_id, (pose, last_seen) in list(self.trackers.items()):
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
        return points

    def next_frame(self):
        self.detection_index += 1
        self._forget_stale()

    def close(self):
        for pose, _ in self.trackers.values():
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


def get_people(frame, result, estimator):
    """Return a Person for everyone YOLO is tracking in this frame."""
    estimator.next_frame()
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return []

    coords = boxes.xyxy.int().tolist()
    confidences = boxes.conf.tolist()
    ids = boxes.id.int().tolist() if boxes.id is not None else [None] * len(coords)
    has_keypoints = result.keypoints is not None and result.keypoints.conf is not None
    if has_keypoints:
        kp_xy = result.keypoints.xy.int().tolist()
        kp_conf = result.keypoints.conf.tolist()

    people = []
    for i, (box, confidence, track_id) in enumerate(zip(coords, confidences, ids)):
        points = None
        if track_id is not None:
            points = estimator.estimate(frame, track_id, box)
        if points is None and has_keypoints:
            points = yolo_points(kp_xy[i], kp_conf[i])
        people.append(Person(box, confidence, points or [None] * NUM_LANDMARKS, track_id))
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


def draw_label(frame, box, confidence):
    x1, y1, _, _ = box
    label = f"PERSON {confidence:.0%}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    (w, h), _ = cv2.getTextSize(label, font, 0.45, 1)
    top = max(y1 - h - 10, 0)
    cv2.rectangle(frame, (x1, top), (x1 + w + 10, top + h + 8), BOX_COLOR, -1)
    cv2.putText(frame, label, (x1 + 5, top + h + 4), font, 0.45, (0, 0, 0), 1, cv2.LINE_AA)


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


def draw_people(frame, people):
    shapes = [skeleton_shapes(person.points) for person in people]

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
        draw_label(frame, person.box, person.confidence)


def blend(old, new):
    if old is None or new is None:
        return new
    return tuple(int(o + (n - o) * SMOOTHING) for o, n in zip(old, new))


class Smoother:
    """Eases each person's box and skeleton toward their newest pose.

    Poses arrive a few times a second; easing toward them every displayed
    frame makes the overlay glide instead of jump.
    """

    def __init__(self):
        self.shown = {}  # track id -> Person as last drawn

    def update(self, people):
        shown = {}
        result = []
        for person in people:
            old = self.shown.get(person.track_id)
            if person.track_id is not None and old is not None:
                person = Person(
                    blend(old.box, person.box),
                    person.confidence,
                    [blend(o, n) for o, n in zip(old.points, person.points)],
                    person.track_id,
                )
            if person.track_id is not None:
                shown[person.track_id] = person
            result.append(person)
        self.shown = shown
        return result


def wait_for_camera(cap):
    """Read until the camera sends a frame or the warm-up time runs out."""
    deadline = time.monotonic() + CAMERA_WARMUP_SECONDS
    while time.monotonic() < deadline:
        ok, _ = cap.read()
        if ok:
            return True
        time.sleep(0.1)
    return False


def open_webcam(index):
    cap = cv2.VideoCapture(index)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    if not cap.isOpened():
        sys.exit(
            "Couldn't open the webcam. Allow camera access for Terminal in "
            "System Settings > Privacy & Security > Camera, then try again."
        )
    if not wait_for_camera(cap):
        sys.exit(
            "The webcam opened but sent no frames. Close other apps using the "
            "camera (FaceTime, Zoom, Photo Booth) and try again."
        )
    return cap


def load_model():
    if not OPENVINO_PATH.exists():
        print("Converting the model for faster CPU inference (first run only)...")
        YOLO(str(MODEL_PATH)).export(format="openvino", imgsz=IMAGE_SIZE)
    return YOLO(str(OPENVINO_PATH), task="pose")


class Detector:
    """Finds people and their poses."""

    def __init__(self):
        self.model = load_model()
        self.estimator = PoseEstimator()

    def detect(self, frame):
        result = self.model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[PERSON_CLASS],
            imgsz=IMAGE_SIZE,
            device="cpu",
            verbose=False,
        )[0]
        return get_people(frame, result, self.estimator)

    def close(self):
        self.estimator.close()


class BackgroundDetector(threading.Thread):
    """Runs the detector on the newest webcam frame in the background.

    The video keeps playing at full camera speed while detection catches up;
    frames that arrive while it's busy are skipped rather than queued.
    """

    def __init__(self, detector):
        super().__init__(daemon=True)
        self.detector = detector
        self.lock = threading.Lock()
        self.new_frame = threading.Event()
        self.frame = None
        self.people = []
        self.stopped = False

    def submit(self, frame):
        with self.lock:
            self.frame = frame
        self.new_frame.set()

    def latest(self):
        with self.lock:
            return self.people

    def run(self):
        while not self.stopped:
            self.new_frame.wait()
            self.new_frame.clear()
            with self.lock:
                frame, self.frame = self.frame, None
            if frame is None or self.stopped:
                continue
            people = self.detector.detect(frame)
            with self.lock:
                self.people = people

    def stop(self):
        self.stopped = True
        self.new_frame.set()
        self.join()


def show(frame):
    """Display a frame; return False once the user presses q."""
    cv2.imshow(WINDOW, frame)
    return cv2.waitKey(1) & 0xFF != ord("q")


def run_webcam(cap):
    background = BackgroundDetector(Detector())
    background.start()
    smoother = Smoother()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            background.submit(frame.copy())
            draw_people(frame, smoother.update(background.latest()))
            if not show(frame):
                break
    finally:
        background.stop()
        background.detector.close()


def run_video(cap, writer, skip):
    # Video files are processed frame by frame so the saved copy lines up exactly.
    detector = Detector()
    people = []
    frame_index = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            # Detect on every Nth frame; reuse the last boxes and poses in between.
            if frame_index % skip == 0:
                people = detector.detect(frame)

            draw_people(frame, people)
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
        print("Webcam running. Frames are shown only and never saved.")
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
            run_webcam(cap)
        else:
            run_video(cap, writer, args.skip)
    finally:
        cap.release()
        if writer is not None:
            writer.release()
        cv2.destroyAllWindows()
        cv2.waitKey(1)  # lets macOS actually close the window


if __name__ == "__main__":
    main()
