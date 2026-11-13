#!/bin/bash
# Starts WatchDog training on the rented machine in the background, so closing the browser
# tab does not stop it. Run again any time: it resumes. Watch it with: tail -f /workspace/train.log
cd /workspace
(apt-get update -qq && apt-get install -y -qq libgl1 libglib2.0-0) >/dev/null 2>&1 || true
pip install -q "ultralytics==8.4.183" onnx onnxslim onnxruntime "albumentations==2.0.8"
if pgrep -f pod_train.py >/dev/null; then
  echo "Training is already running."
else
  setsid nohup python /workspace/pod_train.py >> /workspace/train.log 2>&1 < /dev/null &
  echo "Training started."
fi
echo "Showing the log (Ctrl+C stops watching, not training):"
sleep 5
tail -f /workspace/train.log
