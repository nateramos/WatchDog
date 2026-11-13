# WatchDog

[![CI](https://github.com/nateramos/WatchDog/actions/workflows/ci.yml/badge.svg)](https://github.com/nateramos/WatchDog/actions/workflows/ci.yml)

**Live:** https://main.dbzst24ccqq7g.amplifyapp.com

WatchDog is a campus safety tool that informs human responders and does not make decisions for them. For the contest MVP, it analyzes one recorded video with an object detection model that flags a possible weapon and displays a confidence score. Each alert goes to a human review screen where a person confirms or dismisses it, with an on-screen prompt to call 911 and a log of every override. The MVP uses no facial recognition. See the [roadmap](#roadmap) for what is not built yet.

Nate Ramos, CUA Busch School AI Vibe Coding Contest, Fall 2026

**Tech stack:** React + Vite, Model Dublin (a YOLO11m model from Ultralytics, trained for guns and knives), ONNX Runtime Web, AWS Amplify Hosting.

## Try the demo

Open the live site and click **View Demo**. Enter a reviewer name, then upload a clip. (The built-in demo video is being updated.)

1. WatchDog checks about four frames per second for a possible gun. The model also knows knives, but the MVP flags firearms only.
2. A gun at 40% confidence or higher, found in two checked frames in a row, is shown as a flagged frame with a box and its confidence score. One-frame blips are dropped.
3. Detections taller than a quarter of the frame are ignored (see [CCTV size limit](#cctv-size-limit)).
4. A reviewer must **Confirm** or **Dismiss** each flag. Nothing counts as an alert until a person confirms it.
5. Every flag and decision goes into the review log, which can be exported as CSV.

## Safety and privacy

- **Prototype notice:** every page says WatchDog is a prototype and does not replace calling 911 or Campus Police.
- **Human review:** the model never raises an alert by itself.
- **Review log:** each flag, its confidence, the decision, and the reviewer are recorded.
- **No facial recognition:** WatchDog detects objects only and identifies no one.
- **Video stays on the device:** the model runs in the browser, so uploaded clips are never sent to a server.
- **No real people on campus:** test clips are staged at home with an orange-tipped prop gun.

## Test footage

WatchDog is tested on staged clips filmed at home with an orange-tipped prop gun. Unlike stock footage, home filming lets us control lighting, image quality, camera height and angle to imitate campus CCTV.

The current test set is **42 clips** (listed in `tracking/eval/clips.csv`; the videos are not in the repo):

- **6 with the prop gun:** walking while holding it, pulling it out of a backpack, and holding it behind the back then drawing it.
- **36 without a gun:** everyday objects that could fool a detector, such as a phone, backpack, water bottles, a game controller, a broom, a notebook, a laptop, a hat, a TV remote, a comb, shoes, scissors, keys and a shopping bag.
- Every clip was filmed twice: in **normal light** and in **dim light**.

## Results

Model Dublin with the demo's settings (40% confidence, one check every quarter second, two checks in a row, CCTV size limit):

| | Normal light | Dim light | Total |
| --- | --- | --- | --- |
| **Gun clips caught** | 3 of 3 | 3 of 3 | **6 of 6 (100%)** |
| **No-gun clips with no false alarm** | 18 of 18 | 17 of 18 | **35 of 36 (97.2%)** |
| **No-gun frames with no false alarm** | | | **1,381 of 1,383 (99.9%)** |

Every gun clip was flagged at 76 to 86% confidence. Per-clip results are in `tracking/eval/results.csv`; rerun them with `python tracking/eval_clips.py CLIP_DIR`.

### CCTV size limit

Model Dublin is trained to detect guns in any footage. WatchDog adds limits to optimize it for CCTV: on a ceiling camera a whole person fills a small part of the frame, so a real gun is always small. Any detection taller than a quarter of the frame is ignored (`MAX_BOX_HEIGHT` in `src/boxes.js`).

In early testing, dark doorways in dim light caused most false alarms. The CCTV size limit fixed this.

### Speed

On a cloud GPU (NVIDIA T4), Model Dublin checks a frame in about 0.3 seconds. In the web demo it runs on the viewer's own computer, so speed depends on that device.

This is why a person reviews every flag: no detector is perfect, and WatchDog leaves the decision to a human.

## Rubric alignment

Fall 2026 judging rubric (100 points, plus up to 5 bonus):

| Category | Weight | How WatchDog addresses it |
| --- | --- | --- |
| Functionality & technical execution | 25% | Live demo on AWS Amplify: Model Dublin running in the browser with ONNX Runtime Web, a full-frame-rate video overlay, human confirm/dismiss review, and an exportable review log. |
| Problem identification & relevance | 20% | Campus safety: point a human at the moment a camera may show a weapon. Tested on 42 staged clips that imitate campus CCTV, including dim light and everyday look-alike objects (see Results). |
| AI integration & innovation | 20% | Model Dublin (YOLO11m) trained on about 146,000 weapon images and 49,000 look-alike photos; a second check on a rotated frame for upright guns; a two-in-a-row rule; a CCTV size limit; detection boxes interpolated between checked frames. |
| Code quality & GitHub transparency | 15% | Small single-purpose modules, 19 unit tests, CI on every push, and a step-by-step public commit history. Training data sources and licenses are listed, and test results are in the repo. |
| UX & design | 10% | Clear upload-and-review flow, confirm/dismiss review cards, works on phone and desktop. |
| Business impact & presentation | 10% | No server or per-camera cloud cost: detection runs on the viewer's device. |
| Bonus: ethical AI | up to 5 | Human review of every flag, no facial recognition, video never uploaded, staged footage with a prop gun only, no real people on campus. |

## Roadmap

Not in the demo yet:

- A new demo video filmed in CCTV style
- A simple campus map that shows which camera raised a flag
- Tracking across multiple cameras
- Body tracking and movement prediction for responders

## Run it locally

```
npm install
npm run dev     # local site at http://localhost:5173
npm test        # unit tests for box math and the review log
```

## Model Dublin

WatchDog's detector is **Model Dublin**, a YOLO11m model (Ultralytics) trained to find guns and knives. It runs at 640 x 640 pixels and is exported to ONNX (`public/models/weapons.onnx`, 80 MB) so it runs in the browser. The model knows both classes, but WatchDog flags firearms only.

How it was trained:

1. **Weapon photos:** about 146,000 public images with a box drawn around each gun or knife, merged from the datasets below. Several of them are real CCTV or surveillance footage.
2. **Look-alike photos:** about 49,000 photos with no weapon (phones, umbrellas, remotes, cameras, ceiling fans and similar), which teach the model what *isn't* a gun.
3. **Training:** on a rented cloud GPU, checked against 11,694 held-out images the model never trained on.

| Result on the held-out images | |
| --- | --- |
| Gun detection score (mAP50) | **0.874** |
| False alarms on 5,495 look-alike photos | **11 (0.2%)** |

### Training data

| Source | What it adds | License |
| --- | --- | --- |
| [Weapons 130k](https://www.kaggle.com/datasets/haiderkhan6410/weapons-130k) (Kaggle) | Guns, knives and background images | CC BY 4.0 |
| Roboflow Universe: FYP Weapon Detection in CCTV, CCTV Gun Detector, Monash Guns Dataset, Detectando Armas, MGD | Guns, several from CCTV | CC BY 4.0 |
| Roboflow Universe: WeaponDataset, NoGun | CCTV guns and gun-free CCTV frames | Research use only |
| [University of Seville, Real-time gun detection in CCTV](https://huggingface.co/datasets/jsalazar/US-Real-time-gun-detection-in-CCTV-An-open-problem-dataset) | Real CCTV of a staged attack, plus synthetic images | CC BY-NC 4.0 |
| [University of Granada, OD-WeaponDetection](https://github.com/ari-dasci/OD-WeaponDetection) | Pistols, knives and similar handheld objects | CC BY 4.0 |
| [Google Open Images V7](https://storage.googleapis.com/openimages/web/index.html) | Guns, knives and look-alike photos | CC BY 4.0 (labels), CC BY 2.0 (images) |
| [YouTube-GDD](https://github.com/UCAS-GYX/YouTube-GDD) | About 5,000 frames from YouTube videos with guns | Apache-2.0 |
| [COCO 2017](https://cocodataset.org/) | Look-alike photos (phones, umbrellas, remotes...) | CC BY 4.0 |

Some sets allow research or non-commercial use only, which fits a student prototype. A commercial version would need to retrain without them. The scripts that built the model are in `tracking/train/` ([how Model Dublin was made](tracking/train/README.md)).

`tracking/track.py` is the desktop prototype: it tracks people (pose) and the objects they hold on a webcam or video file. The web demo is where weapon detection runs.

