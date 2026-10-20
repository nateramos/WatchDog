# WatchDog

[![CI](https://github.com/nateramos/WatchDog/actions/workflows/ci.yml/badge.svg)](https://github.com/nateramos/WatchDog/actions/workflows/ci.yml)

**Live:** https://main.dbzst24ccqq7g.amplifyapp.com

WatchDog is a campus safety tool that informs human responders and does not make decisions for them. For the contest MVP, it analyzes one recorded video with an object detection model that flags a possible weapon and displays a confidence score. Each alert goes to a human review screen where a person confirms or dismisses it, with an on-screen prompt to call 911 and a log of every override. The MVP uses no facial recognition. See the [roadmap](#roadmap) for what is not built yet.

Nate Ramos, CUA Busch School AI Vibe Coding Contest, Fall 2026

**Tech stack:** React + Vite, YOLOv8n (Ultralytics) fine-tuned for guns and knives, ONNX Runtime Web, AWS Amplify Hosting.

## Try the demo

Open the live site and click **View Demo**. Enter a reviewer name, then upload a clip or click **Run demo video**.

1. WatchDog checks about two frames per second for a possible gun. The model also knows knives, but the MVP flags firearms only.
2. Anything at 40% confidence or higher is shown as a flagged frame with a box and its confidence score.
3. A reviewer must **Confirm** or **Dismiss** each flag. Nothing counts as an alert until a person confirms it.
4. Every flag and decision goes into the review log, which can be exported as CSV.

## Safety and privacy

- **Prototype notice:** every page says WatchDog is a prototype and does not replace calling 911 or Campus Police.
- **Human review:** the model never raises an alert by itself.
- **Review log:** each flag, its confidence, the decision, and the reviewer are recorded.
- **No facial recognition:** WatchDog detects objects only and identifies no one.
- **Video stays on the device:** the model runs in the browser, so uploaded clips are never sent to a server.
- **No real people on campus:** testing uses licensed stock footage only.

## Test video sources

| Clip | Source | License |
| --- | --- | --- |
| Sample clip in the demo (`public/samples/sample-pexels-4006667.mp4`) | [Pexels video 4006667](https://www.pexels.com/video/4006667/) | [Pexels License](https://www.pexels.com/license/) |
| Local test clips 6090900, 6201060, 6209372, 8683478, 9465975 (not in the repo) | Pexels | [Pexels License](https://www.pexels.com/license/) |
| Hard-case clips listed in `tracking/eval/clips.csv` (not in the repo) | [Mixkit](https://mixkit.co/) and Pexels | [Mixkit Free License](https://mixkit.co/license/), Pexels License |

## Hard cases: misses and false alarms

The demo clip is an easy case. To see where WatchDog goes wrong, 19 licensed stock clips were run through the same model and settings as the web demo (firearms only, 40% threshold, one frame every half second): 11 with no weapon but something that could fool it, and 8 with a weapon, mostly indoors or in the dark. Every flag snapshot was checked by hand to see if the box was on the weapon. Run it yourself with `python tracking/eval_clips.py CLIP_DIR` (clip list and sources in `tracking/eval/clips.csv`).

**No weapon in the clip:**

| Clip | What WatchDog flagged | Right? |
| --- | --- | --- |
| Students walking down a school hallway with books | gun 48% on a student's jacket, hand in pocket | False alarm |
| Phone in one hand, dim room | gun 45% on a houseplant | False alarm |
| Two people under an open umbrella | nothing | Correct |
| Woman holding a black umbrella by its handle | nothing | Correct |
| Cordless drill at a workbench | gun 46%, gun 41% on the drill | False alarm |
| Close-up of a power drill | nothing | Correct |
| Hair dryer pointed at the camera | gun 49%, gun 52% on the dryer and the woman | False alarm |
| Black saxophone case carried through a dim room | gun 73% on the saxophone, gun 65% on a suspender strap | False alarm |
| Flashlight held in a dark room | nothing | Correct |
| Photographer carrying a tripod in snow | gun 45 to 61% on the tripod, 3 times | False alarm |
| Worker pushing a metal cart down a hospital hallway | gun 48%, gun 42% on the worker and cart | False alarm |

**Weapon in the clip:**

| Clip | What WatchDog flagged | Right? |
| --- | --- | --- |
| Rifle in full view outdoors, daylight (demo clip) | gun 86%, every checked frame | Caught |
| Handgun at an indoor range, green light | gun 89%, 12 of 14 frames | Caught |
| Handgun raised beside a face for a few seconds | gun 55%, 1 of 37 frames | Caught, barely |
| Reenactor with a musket and ramrod | gun up to 79% on the musket | Caught |
| Hunter with a rifle slung on his back | gun 53% on the barrel; also gun 85% on bare trees | Caught, plus a false box |
| Handgun with a flashlight, very dark apartment | gun 72% on the gun; one box on a door frame | Caught |
| Handgun drawn in a dark hallway (vertical video) | nothing | **Missed** |
| Silhouette with a gun light, dim hallway (vertical video) | nothing | **Missed** |

**What this shows:**

- **Caught 6 of 8** weapon clips. Both misses were dark, backlit and filmed in portrait.
- **False alarms in 7 of 11** no-weapon clips: 13 false flags in about 2.5 minutes of video, and 16 of 297 checked frames (5.4%). Drills, tripods, a hair dryer and a saxophone look like guns to the model.
- **The threshold is a trade-off.** Most false flags scored under 60%. Raising the threshold to 60% would remove 10 of the 13, but would also lose the hunter's rifle (53%) and the brief handgun (55%).
- This is why a person reviews every flag. Next steps: a person-first crop so small weapons fill more of the frame, more dark and CCTV-style training images, and drills, tripods and umbrellas added as "not a weapon" examples.

These numbers are from a desktop rerun of the browser code (`tracking/eval_clips.py`), so a score can differ by a point or two from the live site. 19 clips is a small test, not a benchmark.

## Rubric alignment

Fall 2026 judging rubric (100 points, plus up to 5 bonus):

| Category | Weight | How WatchDog addresses it |
| --- | --- | --- |
| Functionality & technical execution | 25% | Live demo on AWS Amplify: a weapon-detection model running in the browser with ONNX Runtime Web, a full-frame-rate video overlay, human confirm/dismiss review, and an exportable review log. |
| Problem identification & relevance | 20% | Campus safety: point a human at the moment a camera may show a weapon. Framed around the real failure modes of AI gun detection: false alarms and misses, measured on 19 hard-case clips (see Hard cases). |
| AI integration & innovation | 20% | YOLOv8n fine-tuned on Open Images guns and knives; a second check on a rotated frame for upright guns; person, object and weapon steps in the desktop prototype; detection boxes interpolated between checked frames. |
| Code quality & GitHub transparency | 15% | Small single-purpose modules, 15 unit tests, CI on every push, and a step-by-step public commit history. Hand-placed illustrations and model limits are documented, not hidden. |
| UX & design | 10% | One-click demo video, "What WatchDog sees" step-by-step pictures, confirm/dismiss review cards, works on phone and desktop. |
| Business impact & presentation | 10% | No server or per-camera cloud cost: detection runs on the viewer's device, about 4 frames per second for all three steps on a 2020 laptop CPU. |
| Bonus: ethical AI | up to 5 | Human review of every flag, no facial recognition, video never uploaded, licensed footage only, no real people on campus. |

## Roadmap

Not in the demo yet:

- A simple campus map that shows which camera raised a flag
- Tracking across multiple cameras
- Body tracking and movement prediction for responders

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
