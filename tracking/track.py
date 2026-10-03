"""Lightweight, CPU-only person tracking for WatchDog.

Everything runs on this computer. People are tracked by box position and
motion (ByteTrack) - there is no facial recognition. Webcam frames are only
shown on screen; they are never saved or uploaded.

Usage:
    python track.py                 # asks: video file or webcam
    python track.py path/to/video.mp4
    python track.py --webcam
"""

import argparse
import os
import sys
from pathlib import Path

# Keep Ultralytics offline: no usage analytics or hub calls.
os.environ.setdefault("YOLO_OFFLINE", "1")

import cv2
from ultralytics import YOLO, settings

settings.update({"sync": False})

HERE = Path(__file__).resolve().parent
MODEL_PATH = HERE / "yolov8n.pt"  # downloaded here on first run
OUTPUT_DIR = HERE / "output"
PERSON_CLASS = 0
IMAGE_SIZE = 320
WINDOW = "WatchDog tracking - press q to quit"
BOX_COLOR = (255, 140, 79)  # BGR, matches the site's blue


def parse_args():
    parser = argparse.ArgumentParser(description="CPU-only person tracking.")
    parser.add_argument("video", nargs="?", help="path to a video file")
    parser.add_argument("--webcam", action="store_true", help="use the webcam")
    parser.add_argument("--camera", type=int, default=0, help="webcam index (default 0)")
    parser.add_argument(
        "--skip",
        type=int,
        default=2,
        help="run detection on every Nth frame (default 2; try 3 if it's slow)",
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


def get_tracks(result):
    """Return [(x1, y1, x2, y2, track_id), ...] for tracked people."""
    boxes = result.boxes
    if boxes is None or boxes.id is None:
        return []
    coords = boxes.xyxy.int().tolist()
    ids = boxes.id.int().tolist()
    return [(*box, track_id) for box, track_id in zip(coords, ids)]


def draw_tracks(frame, tracks):
    for x1, y1, x2, y2, track_id in tracks:
        cv2.rectangle(frame, (x1, y1), (x2, y2), BOX_COLOR, 2)
        label = f"ID {track_id}"
        (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        top = max(y1 - h - 8, 0)
        cv2.rectangle(frame, (x1, top), (x1 + w + 8, top + h + 8), BOX_COLOR, -1)
        cv2.putText(
            frame, label, (x1 + 4, top + h + 3),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2,
        )


def run(cap, writer, skip):
    model = YOLO(str(MODEL_PATH))
    tracks = []
    frame_index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        # Detect on every Nth frame; reuse the last boxes in between.
        if frame_index % skip == 0:
            result = model.track(
                frame,
                persist=True,
                tracker="bytetrack.yaml",
                classes=[PERSON_CLASS],
                imgsz=IMAGE_SIZE,
                device="cpu",
                verbose=False,
            )[0]
            tracks = get_tracks(result)

        draw_tracks(frame, tracks)
        if writer is not None:
            writer.write(frame)
        cv2.imshow(WINDOW, frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
        frame_index += 1


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
        cap = cv2.VideoCapture(args.camera)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        if not cap.isOpened():
            sys.exit(
                "Couldn't open the webcam. Allow camera access for Terminal in "
                "System Settings > Privacy & Security > Camera, then try again."
            )
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
        run(cap, writer, args.skip)
    finally:
        cap.release()
        if writer is not None:
            writer.release()
        cv2.destroyAllWindows()
        cv2.waitKey(1)  # lets macOS actually close the window


if __name__ == "__main__":
    main()
