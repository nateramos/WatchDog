# How Model Dublin was made

These are the scripts behind Model Dublin, the YOLO11m gun and knife detector in `public/models/weapons.onnx`. The data sources and their licenses are listed in the main README under [Training data](../../README.md#training-data).

## The steps

1. **Build the dataset** (`train_full_pc.py`, run with `WATCHDOG_STAGE=data`). Downloads every public weapon dataset (Kaggle, Roboflow Universe, University of Seville, University of Granada, Google Open Images, YouTube-GDD), turns every label into `gun` or `knife`, drops broken and duplicate images, and adds CCTV-style copies of some images (lower resolution, blur, dimmer light, noise, black-and-white and night-vision looks). Kaggle and Roboflow keys are read from your own computer's settings and are never stored in these files. About 146,000 images in the end.
2. **Send it to a rented GPU** (`rent/pack_for_rental.ps1` and `.py`). Shrinks the images to the training size and sends one file to a RunPod machine with `runpodctl`.
3. **Train at 640 pixels** (`rent/pod_train.sh` starts `rent/pod_train.py`; `rent/pod_train2.py` holds the exact settings of the main run). Result: mAP50 0.868, gun 0.870.
4. **Try 960 pixels** (`rent/pod_train3.py`). About a tie (gun 0.871) for more than twice the work per frame, so the browser keeps 640.
5. **Add look-alike photos** (`rent/send_negatives.ps1` starts `rent/pod_neg.sh`). `rent/pod_negatives.py` downloads photos of things that are not guns (phones, umbrellas, remotes, cameras, ceiling fans and more) from Open Images and COCO, skipping any photo tagged with a weapon. `rent/pod_train4.py` then fine-tunes the 640 model on the gun set plus these photos. This is Model Dublin: gun mAP50 0.874, and false alarms on 11 of 5,495 look-alike photos (0.2%).
6. **Bring it home** (`rent/get_results.cmd`, `rent/get_model.ps1`). The pod exports the finished model to ONNX for the browser; these download it and the training charts.

## Other tools

| Script | What it does |
| --- | --- |
| `fetch_datasets.py`, `merge_datasets.py`, `prep_dataset.py` | Smaller building blocks: download some datasets, merge extra YOLO datasets in, and clean a dataset |
| `extract_frames.py` | Turns your own clips into training frames, with draft boxes from the current model to fix by hand |
| `preview_dataset.py` | Draws a few images from each dataset with their boxes, to check the labels |
| `plot_training.py` | Charts training progress while it runs |
| `size_scan.py`, `size_test.py` | Measure the training images and test whether a bigger training size helps |
| `train_local.py` | Quick fine-tune on a computer with no graphics card |
| `prepare_weapon_data.py`, `train_weapons.ipynb` | The earlier free Google Colab path, using Open Images only |

Large files (datasets, training runs, downloaded models, `runpodctl.exe`) stay out of the repo.
