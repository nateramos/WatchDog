# WatchDog

[![CI](https://github.com/nateramos/WatchDog/actions/workflows/ci.yml/badge.svg)](https://github.com/nateramos/WatchDog/actions/workflows/ci.yml)

**Live:** https://main.dbzst24ccqq7g.amplifyapp.com

WatchDog is a campus safety tool that informs human responders and does not make decisions for them. For the contest MVP, it analyzes one recorded video with an object detection model that flags a possible weapon and displays a confidence score. Each alert goes to a human review screen where a person confirms or dismisses it, with an on-screen prompt to call 911 and a log of every override. A simple campus map plots the camera that raised the alert. The MVP uses no facial recognition. Multi-camera tracking, body tracking, and movement prediction are on the roadmap.

Nate Ramos, CUA Busch School AI Vibe Coding Contest, Fall 2026

**Tech stack:** React + Vite, YOLOv8n (Ultralytics) fine-tuned for guns and knives, ONNX Runtime Web, AWS Amplify Hosting.

## Try the demo

Open the live site and click **View Demo**. Enter a reviewer name, then click **Run demo video**.

1. WatchDog checks about two frames per second for a possible gun or knife.
2. Anything at 40% confidence or higher is shown as a flagged frame with a box and its confidence score.
3. A reviewer must **Confirm** or **Dismiss** each flag. Nothing counts as an alert until a person confirms it.
4. Every flag and decision goes into the review log, which can be exported as CSV.

## Safety and privacy

- **Prototype notice:** every page is marked as a student prototype.
- **Human review:** the model never raises an alert by itself.
- **Review log:** each flag, its confidence, the decision, and the reviewer are recorded.
- **No facial recognition:** WatchDog detects objects only and identifies no one.
- **Video stays on the device:** the model runs in the browser, so video is never sent to a server.
- **No real people on campus:** testing uses licensed stock footage and staged clips with obvious props, recorded off campus.

## Test video sources

| Clip | Source | License |
| --- | --- | --- |
| Sample clip in the demo (`public/samples/sample-pexels-4006667.mp4`) | [Pexels video 4006667](https://www.pexels.com/video/4006667/) | [Pexels License](https://www.pexels.com/license/) |
| Local test clips 6090900, 6201060, 6209372, 8683478, 9465975 (not in the repo) | Pexels | [Pexels License](https://www.pexels.com/license/) |

Staged clips will be recorded at home with an obvious toy or replica and no bystanders.

## Rubric alignment

| Category | Points | How WatchDog addresses it |
| --- | --- | --- |
| Problem Definition & Relevance | 10 | Campus safety: point a human at the moment a camera may show a weapon. Framed around the real failure modes of AI gun detection: false alarms and misses. |
| AI Feature Innovation & Integration | 20 | YOLOv8n fine-tuned on Open Images guns and knives; runs in the browser with ONNX Runtime Web; second check on a rotated frame for upright guns; person, object and weapon steps in the desktop prototype; detection boxes interpolated over full-frame-rate video. |
| Technical Execution & Code Quality | 20 | React + Vite in small single-purpose modules; 15 unit tests (box math, model output decoding, CSV export); CI runs tests and build on every push. |
| User Experience & Design | 10 | One-click demo video, "What WatchDog sees" step-by-step pictures, live video overlay, confirm/dismiss review cards, works on phone and desktop. |
| Business Impact & Scalability | 10 | No server and no per-camera cloud cost: detection runs on the viewer's device. About 4 frames per second for all three steps on a 2020 laptop CPU. Multi-camera tracking is on the roadmap. |
| GitHub Transparency | 10 | Step-by-step commit history from skeleton to deployed demo; hand-placed illustrations and model limits are documented, not hidden. |
| Documentation & Communication | 10 | This README, the public About page, test video sources and licenses, and measured speed per step. |
| Deployment & Live Demo | 10 | Live on AWS Amplify, no login needed, rebuilt automatically on every push. |

## Run it locally

```
npm install
npm run dev     # local site at http://localhost:5173
npm test        # unit tests for box math and the review log
```

## Model

`tracking/train/` builds a gun/knife dataset from Google's Open Images and fine-tunes YOLOv8n. The trained weights are exported to ONNX (`public/models/weapons.onnx`) for the browser. `tracking/track.py` is the desktop prototype that runs the detector with pose tracking on a webcam or video file.

## Speed

Measured on a 2020 MacBook Air (Intel Core i5-1030NG7, CPU only), model time per frame:

| Step | Model | OpenVINO (desktop) | PyTorch |
| --- | --- | --- | --- |
| 1. Person + pose | YOLOv8n-pose | 33 ms | 119 ms |
| 2. Objects | YOLOv8n | 112 ms | 135 ms |
| 3. Weapon | weapons.pt | 101 ms | 117 ms |
| **All three** | | **~250 ms (~4 fps)** | ~370 ms (~2.7 fps) |

The web demo runs only the weapon model, in the browser with ONNX Runtime Web on one CPU thread, at about 1 to 1.5 seconds per frame including video seeking.
