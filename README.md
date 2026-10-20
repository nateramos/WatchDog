# WatchDog

[![CI](https://github.com/nateramos/WatchDog/actions/workflows/ci.yml/badge.svg)](https://github.com/nateramos/WatchDog/actions/workflows/ci.yml)

**Live:** https://main.dbzst24ccqq7g.amplifyapp.com

WatchDog is a campus safety tool that informs human responders and does not make decisions for them. For the contest MVP, it analyzes one recorded video with an object detection model that flags a possible weapon and displays a confidence score. Each alert goes to a human review screen where a person confirms or dismisses it, with an on-screen prompt to call 911 and a log of every override. The MVP uses no facial recognition. See the [roadmap](#roadmap) for what is not built yet.

Nate Ramos, CUA Busch School AI Vibe Coding Contest, Fall 2026

**Tech stack:** React + Vite, YOLOv8n (Ultralytics) fine-tuned for guns and knives, ONNX Runtime Web, AWS Amplify Hosting.

## Try the demo

Open the live site and click **View Demo**. Enter a reviewer name, then upload a clip or click **Run demo video**.

1. WatchDog checks about four frames per second for a possible gun. The model also knows knives, but the MVP flags firearms only.
2. A gun at 40% confidence or higher, found in two checked frames in a row, is shown as a flagged frame with a box and its confidence score. One-frame blips are dropped.
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

The demo clip is an easy case. To see where WatchDog goes wrong, 19 licensed stock clips were run through the same model and settings as the web demo (firearms only, 40% threshold, one frame every quarter second, two in a row): 11 with no weapon but something that could fool it, and 8 with a weapon, mostly indoors or in the dark. Every flag snapshot was checked by hand to see if the box was on the weapon. Run it yourself with `python tracking/eval_clips.py CLIP_DIR` (clip list and sources in `tracking/eval/clips.csv`, results in `tracking/eval/results.csv`).

**No weapon in the clip:**

| Clip | What WatchDog flagged | Right? |
| --- | --- | --- |
| Students walking down a school hallway with books | nothing | Correct |
| Phone in one hand, dim room | nothing | Correct |
| Two people under an open umbrella | nothing | Correct |
| Woman holding a black umbrella by its handle | nothing | Correct |
| Cordless drill at a workbench | gun 46%, gun 75% on the drill | False alarm |
| Close-up of a power drill | nothing | Correct |
| Hair dryer pointed at the camera | nothing | Correct |
| Black saxophone case carried through a dim room | gun 73% on the saxophone | False alarm |
| Flashlight held in a dark room | nothing | Correct |
| Photographer carrying a tripod in snow | gun 51 to 70% on the tripod, 3 times | False alarm |
| Worker pushing a metal cart down a hospital hallway | gun 48% on the worker and cart | False alarm |

**Weapon in the clip:**

| Clip | What WatchDog flagged | Right? |
| --- | --- | --- |
| Rifle in full view outdoors, daylight (demo clip) | gun 87%, every checked frame | Caught |
| Handgun at an indoor range, green light | gun 89%, 24 of 28 frames | Caught |
| Handgun raised beside a face for a few seconds | gun 60%, 3 of 73 frames | Caught, barely |
| Reenactor with a musket and ramrod | gun up to 81% on the musket | Caught |
| Hunter with a rifle slung on his back | gun 58% on the barrel; also gun 85% on bare trees | Caught, plus a false box |
| Handgun with a flashlight, very dark apartment | gun up to 66% on the gun | Caught |
| Handgun drawn in a dark hallway (vertical video) | nothing | **Missed** |
| Silhouette with a gun light, dim hallway (vertical video) | nothing | **Missed** |

**What this shows:**

- **Caught 6 of 8** weapon clips. Both misses were dark, backlit and filmed in portrait.
- **False alarms in 4 of 11** no-weapon clips: 7 false flags in about 2.5 minutes of video, and 16 of 591 checked frames (2.7%). The ones left are objects held steady, like a drill, a tripod and a saxophone, so they show up in back-to-back frames.
- **Two in a row halves the false alarms.** Until Oct 20 the demo checked one frame every half second and flagged single frames: the same 6 of 8 weapons, but false alarms in 7 of 11 clips (13 false flags, 5.4% of frames), including a student with a hand in a jacket pocket and a houseplant. Checking twice as often keeps brief guns, which would otherwise be seen in only one frame. The cost is a scan that takes about twice as long.
- This is why a person reviews every flag. Next steps: staged clips filmed for WatchDog, a person-first crop so small weapons fill more of the frame, and more dark and CCTV-style training images.

These numbers are from a desktop rerun of the browser code (`tracking/eval_clips.py`), so a score can differ by a point or two from the live site. 19 clips is a small test, not a benchmark.

### Retraining attempt (Oct 20)

After this test, the model was retrained with drills, hair dryers, instruments, cases and common school items added as "not a gun" photos (see [Balancing "gun" and "not a gun" training images](#balancing-gun-and-not-a-gun-training-images)), plus more brightness variation for dark scenes. Every snapshot was checked by hand again. "Two in a row" means a gun only counts if it is also found in the frame checked just before or after.

| Model and setting | Weapons caught | No-weapon clips with a false alarm | False flags | Falsely flagged frames |
| --- | --- | --- | --- | --- |
| Old model, one frame every 0.5 s | 6 of 8 | 7 of 11 | 13 | 5.4% |
| Old model, two in a row, every 0.25 s | 6 of 8 | 4 of 11 | 7 | 2.7% |
| New model, one frame every 0.5 s | 6 of 8 | 7 of 11 | 9 | 7.1% |
| New model, two in a row, every 0.25 s | 4 of 8 | 2 of 11 | 3 | 3.0% |

- **Better:** the hair dryer is no longer flagged, and the saxophone, workbench drill and cart each dropped to one false flag. It caught the handgun drawn in a dark hallway that the old model missed, and all its boxes in the dark apartment clip are on the gun.
- **Worse:** a student walking with a hand in a jacket pocket went from one flag at 48% to seven flagged frames at up to 75%. The tripod was flagged more often, a close-up drill was newly flagged, and it lost the hunter's slung rifle.

The live demo keeps the old model: it catches as many weapons, and the student false alarm is the kind a campus can least afford. The new model's per-clip results are in `tracking/eval/results_model_v2.csv`. Next: test on staged clips filmed for WatchDog, then retrain with labeled frames from them.

## Rubric alignment

Fall 2026 judging rubric (100 points, plus up to 5 bonus):

| Category | Weight | How WatchDog addresses it |
| --- | --- | --- |
| Functionality & technical execution | 25% | Live demo on AWS Amplify: a weapon-detection model running in the browser with ONNX Runtime Web, a full-frame-rate video overlay, human confirm/dismiss review, and an exportable review log. |
| Problem identification & relevance | 20% | Campus safety: point a human at the moment a camera may show a weapon. Framed around the real failure modes of AI gun detection: false alarms and misses, measured on 19 hard-case clips (see Hard cases). |
| AI integration & innovation | 20% | YOLOv8n fine-tuned on Open Images guns and knives; a second check on a rotated frame for upright guns; person and held-object tracking in the desktop prototype; detection boxes interpolated between checked frames. |
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

`tracking/train/` builds a gun/knife dataset from Google's Open Images and fine-tunes YOLOv8n. The trained weights are exported to ONNX (`public/models/weapons.onnx`) for the browser. `tracking/track.py` is the desktop prototype: it tracks people (pose) and the objects they hold on a webcam or video file. Its weapon step is switched off (`WEAPONS_ENABLED = False`) while held-object detection is tuned; the web demo is where weapon detection runs.

### Balancing "gun" and "not a gun" training images

The model learns from two kinds of photos: weapon photos with a box drawn around each gun or knife, and look-alike photos with no weapon and no box, which teach it what *isn't* a gun. Getting the mix right is a trade-off:

- **Too few look-alikes:** the model flags anything gun-shaped. In the hard-case test, drills, a tripod, a hair dryer and a saxophone were all flagged as guns.
- **Too many look-alikes:** the model gets cautious and starts missing real guns, which is worse for a safety tool.

The training set adds **30 look-alike photos for every 100 weapon photos** (`--lookalike-ratio 0.3` in `prepare_weapon_data.py`), so about a quarter of the photos have no weapon. They are picked **evenly across about 40 kinds of object** (drills, tripods, instruments, cases, and things students carry, such as backpacks, laptops, books and bottles) so rare look-alikes aren't crowded out by common ones. We briefly tried 50 per 100 and went back to 30, because Ultralytics' [training tips](https://docs.ultralytics.com/yolov5/tutorials/tips_for_best_training_results/) suggest only 0 to 10% background images. We stay above that because false alarms are WatchDog's biggest problem, and the hard-case test checks whether real guns start getting missed.

## Speed

Measured on a 2020 MacBook Air (Intel Core i5-1030NG7, CPU only), model time per frame:

| Step | Model | OpenVINO (desktop) | PyTorch |
| --- | --- | --- | --- |
| 1. Person + pose | YOLOv8n-pose | 33 ms | 119 ms |
| 2. Objects | YOLOv8n | 112 ms | 135 ms |
| 3. Weapon | weapons.pt | 101 ms | 117 ms |
| **All three** | | **~250 ms (~4 fps)** | ~370 ms (~2.7 fps) |

The web demo runs only the weapon model, in the browser with ONNX Runtime Web on one CPU thread, at about 1 to 1.5 seconds per frame including video seeking.
