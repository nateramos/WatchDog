# WatchDog

[![CI](https://github.com/nateramos/WatchDog/actions/workflows/ci.yml/badge.svg)](https://github.com/nateramos/WatchDog/actions/workflows/ci.yml)

**Live:** https://main.dbzst24ccqq7g.amplifyapp.com (click **Try the demo** to sign in, no password)

WatchDog is a campus safety tool that informs human responders and does not make decisions for them. It watches a building's security cameras for a possible gun, and when it finds one it sends an alert with a snapshot and a short clip to a reviewer, who confirms the threat or dismisses it as a false alarm. Every decision is signed and logged. It uses no facial recognition. It has been tested on security camera footage from three real school shootings (see [Results](#results)).

Nate Ramos, CUA Busch School AI Vibe Coding Contest, Fall 2026

**Tech stack:** React + Vite, Model Dublin (a YOLO11m model from Ultralytics, trained for guns and knives) running in the browser with ONNX Runtime Web, AWS Amplify Hosting, Amazon Cognito (sign-in), Amazon S3 (demo footage), Vitest and GitHub Actions (tests on every push).

## For judges: try it

1. Open the [live site](https://main.dbzst24ccqq7g.amplifyapp.com) and click **Try the demo**. This signs in a test account with one click; no password, and no real data. Every demo sign-in starts with an empty review log.
2. Open **Demo** and press **Start demo**.
3. When the red alert banner appears, open **Alerts**, type a reviewer name, and confirm or dismiss the alert.

## What's in the app

- **Cameras:** the camera wall for a building, with a search box and a **Filters** menu (live or offline, area, floor, wing). This prototype has no live camera connected, so its slots show "Camera offline".
- **Demo:** the same wall replaying a saved WatchDog run on security camera footage that police released after the 2023 Covenant School shooting in Nashville. The boxes and alerts are WatchDog's real results, saved ahead of time so the demo plays instantly; each alert fires at the moment the video reaches it, and the cameras keep running while you are on other pages. Camera names and locations are a sample building layout, not the real school's.
- **Alerts:** one inbox for every alert. Each shows the camera, the time and the confidence score, with a snapshot right away and, a few seconds later, a clip from one second before the gun was first seen to four seconds after, which the reviewer can pause and scrub through frame by frame. A reviewer must sign each **Confirm threat** or **Dismiss**. Every alert and decision goes into the review log ("possible gun", "threat confirmed", "false alarm"), which can be exported as CSV.

How WatchDog decides what to flag:

1. It checks about four frames per second for a possible gun. The model also knows knives, but WatchDog flags firearms only.
2. A gun counts only at 40% confidence or higher and only if it is found in two checked frames in a row, so one-frame blips are dropped.
3. Detections taller than a quarter of the frame are ignored (see [CCTV size limit](#cctv-size-limit)).
4. A new alert is raised the first time a gun is seen; sightings less than 1.5 seconds apart belong to the same alert, which keeps its clearest frame.
5. Nothing counts as a threat until a person confirms it.

## Safety and privacy

- **Prototype notice:** every page says WatchDog is a prototype and does not replace calling 911 or Campus Police.
- **Human review:** the model never raises an alert by itself.
- **Review log:** each flag, its confidence, the decision, and the reviewer are recorded.
- **No facial recognition:** WatchDog detects objects only and identifies no one.
- **Video stays on the device:** the model runs in the browser, so uploaded clips are never sent to a server.
- **No real people on campus:** test clips are staged at home with an orange-tipped prop gun.

## Results

WatchDog was tested three ways: on 11,694 labeled images the model never trained on, on security footage from three real school shootings, and on staged clips filmed at home.

### Lab test: 11,694 images it never saw

After training, Model Dublin was scored on 11,694 held-out images, kept aside so the model never learned from them, and checked for false alarms on 5,495 look-alike photos with no weapon (phones, umbrellas, remotes and similar).

| Result on the held-out images | |
| --- | --- |
| Gun detection score (mAP50) | **0.874** |
| Look-alike photos correctly ignored | **5,484 of 5,495 (99.8%)** |

mAP50 is the standard accuracy score for object detectors, from 0 to 1 (1.0 would be perfect): it combines finding every gun with being right when it says "gun." Scores like this can't be compared directly with other gun detectors, because each study tests on its own set of images, some easy (clear photos) and some very hard (blurry CCTV).

### Real CCTV from three school shootings

We ran WatchDog on five clips of security camera footage from three real school shootings, released publicly by police and news outlets: Uvalde (Robb Elementary, 2022), Parkland (Marjory Stoneman Douglas High School, 2018) and Nashville (Covenant School, 2023). They cover three very different cameras: a fisheye ceiling camera, a stairwell and a smoke-filled hallway, and ordinary ceiling CCTV. Same settings as the app (Model Dublin, 40% confidence, four checks per second, two in a row, CCTV size limit), run with `tracking/eval_clips.py`.

| Clip | Camera | Alerts | Highest confidence | Checked frames flagged |
| --- | --- | --- | --- | --- |
| Uvalde, 15 s | Fisheye ceiling camera, hallway | 2 | 66% | 5 of 60 |
| Parkland, 27 s | Stairwell, then a smoke-filled hallway | 2 | 82% | 12 of 109 |
| Nashville 1, 19 s | Ceiling camera, hallway | 2 | 77% | 27 of 77 |
| Nashville 2, 10 s | Ceiling camera, hallway | 1 | 84% | 20 of 40 |
| Nashville 3, 7 s | Ceiling camera, lobby | 1 | 76% | 22 of 28 |

**WatchDog raised an alert on all five clips, and all 8 alerts were on the real gun** (we checked every alert snapshot by hand). It did best on ordinary ceiling cameras like Nashville's, where it saw the gun in most checked frames; it struggled most with Uvalde's fisheye lens and a distant figure, where it caught the rifle in moments rather than the whole time. That is enough to point a reviewer at the camera, which is WatchDog's job; following the gun continuously is on the [roadmap](#roadmap).

The footage is not in this repo. The clips were cut from [KVUE's Uvalde hallway video](https://www.youtube.com/watch?v=I3poHE3nOb8), [a Parkland video on YouTube](https://www.youtube.com/watch?v=YM-vc6JqzhM) and [The Washington Post's Nashville video](https://www.washingtonpost.com/video/national/police-release-video-of-nashville-shooter-inside-school/2023/03/28/134b2cd2-de2d-43a1-a312-73ea108c3e7f_video.html), and the Demo page's two Nashville feeds are served from a separate storage bucket that can be taken down at any time.

### Staged home clips

We also filmed 42 clips at home with an orange-tipped prop gun, which let us control lighting and camera angle to imitate campus CCTV: 6 with the prop gun, and 36 with everyday objects that could fool a detector (a phone, backpack, laptop, game controller, scissors, keys and more), each in normal and dim light. The clips are listed in `tracking/eval/clips.csv`; the videos are not in the repo.

| | Normal light | Dim light | Total |
| --- | --- | --- | --- |
| **Gun clips caught** | 3 of 3 | 3 of 3 | **6 of 6 (100%)** |
| **No-gun clips with no false alarm** | 18 of 18 | 17 of 18 | **35 of 36 (97.2%)** |

Every gun clip was flagged at 76 to 86% confidence, and 1,381 of 1,383 checked frames in the no-gun clips (99.9%) raised no false alarm. Per-clip results are in `tracking/eval/results.csv`; rerun them with `python tracking/eval_clips.py CLIP_DIR`.

## CCTV size limit

Model Dublin is trained to detect guns in any footage. WatchDog adds limits to optimize it for CCTV: on a ceiling camera a whole person fills a small part of the frame, so a real gun is always small. Any detection taller than a quarter of the frame is ignored (`MAX_BOX_HEIGHT` in `src/boxes.js`).

In early testing, dark doorways in dim light caused most false alarms. The CCTV size limit fixed this.

## Speed

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

Its score on the held-out images is in [Results](#lab-test-11694-images-it-never-saw): 0.874 mAP50 for guns, with 99.8% of look-alike photos correctly ignored.

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

