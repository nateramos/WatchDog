#!/bin/bash
# Look-alike round: download ~25k "not a gun" photos, fine-tune the 640 model, then stop the pod.
# Run in the RunPod web terminal:  bash /workspace/pod_neg.sh
# Watch:  tail -f /workspace/neg.log      (Ctrl+C stops watching, not the job)
cd /workspace
if [ ! -f /workspace/dataset/train.txt ]; then
  if [ -f /workspace/watchdog_dataset.tar ]; then
    echo "Unpacking the dataset to the fast disk (a few minutes)..."
    mkdir -p /root/data && tar xf /workspace/watchdog_dataset.tar -C /root/data
    rm -rf /workspace/dataset && ln -s /root/data/dataset /workspace/dataset
  else
    echo "No dataset on this pod. Send watchdog_dataset.tar from the PC first (pack_for_rental.ps1)."; exit 1
  fi
fi
if [ ! -f /workspace/weapons_new.pt ] && [ ! -f /workspace/runs/weapons_640/weights/best.pt ]; then
  echo "No 640 model here. Send weapons_new.pt from the PC first."; exit 1
fi
(apt-get update -qq && apt-get install -y -qq libgl1 libglib2.0-0) >/dev/null 2>&1 || true
pip install -q "ultralytics==8.4.183" onnx onnxslim onnxruntime "albumentations==2.0.8"
if pgrep -f "pod_negatives.py|pod_train4.py" >/dev/null; then
  echo "Already running."
else
  setsid nohup bash -c 'python /workspace/pod_negatives.py && python /workspace/pod_train4.py; sleep 120; runpodctl stop pod $RUNPOD_POD_ID' >> /workspace/neg.log 2>&1 < /dev/null &
  echo "Started. The pod stops itself 2 minutes after it finishes."
fi
sleep 5
tail -f /workspace/neg.log
