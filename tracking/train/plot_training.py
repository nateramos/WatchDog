"""Plot WatchDog training progress from results.csv (the same 10 charts Ultralytics makes at the
end of training, but available at any time while it is still running).

Saves tracking/train/training_progress.png. Run plot_training.ps1, or:
    python plot_training.py [path/to/results.csv]
"""
import csv
import os
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

DEFAULT = Path(os.environ.get("WATCHDOG_DATA", r"C:\watchdog_data")) / "work" / "runs" / "weapons" / "results.csv"
OUT = Path(__file__).resolve().parent / "training_progress.png"

PANELS = [
    ("train/box_loss", "Train: box loss", "lower is better"),
    ("train/cls_loss", "Train: class loss", "lower is better"),
    ("train/dfl_loss", "Train: edge loss", "lower is better"),
    ("metrics/precision(B)", "Precision", "right when it says gun"),
    ("metrics/recall(B)", "Recall", "real guns it found"),
    ("val/box_loss", "Quiz: box loss", "lower is better"),
    ("val/cls_loss", "Quiz: class loss", "lower is better"),
    ("val/dfl_loss", "Quiz: edge loss", "lower is better"),
    ("metrics/mAP50(B)", "mAP50 (main score)", "higher is better"),
    ("metrics/mAP50-95(B)", "mAP50-95 (strict)", "higher is better"),
]


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    rows = [{k.strip(): v for k, v in r.items()} for r in csv.DictReader(open(path))]
    if not rows:
        print("No finished passes yet.")
        return
    epochs = [int(float(r["epoch"])) for r in rows]
    times = [float(r["time"]) for r in rows]
    per_pass = [times[0]] + [b - a for a, b in zip(times, times[1:])]
    best_i = max(range(len(rows)), key=lambda i: float(rows[i]["metrics/mAP50(B)"]))

    fig, axes = plt.subplots(2, 5, figsize=(20, 8.5))
    for ax, (key, title, hint) in zip(axes.flat, PANELS):
        ys = [float(r[key]) for r in rows]
        ax.plot(epochs, ys, "o-", color="#2563eb", lw=2, ms=6)
        if len(ys) >= 3:  # 3-pass moving average, like Ultralytics' "smooth" line
            sm = [sum(ys[max(0, i - 1):i + 2]) / len(ys[max(0, i - 1):i + 2]) for i in range(len(ys))]
            ax.plot(epochs, sm, ":", color="#f97316", lw=2)
        ax.axvline(epochs[best_i], color="#16a34a", ls="--", lw=1, alpha=0.6)
        ax.set_title(title, fontsize=12, fontweight="bold")
        ax.set_xlabel(f"pass   ({hint})", fontsize=9, color="#555")
        ax.set_xticks(epochs if len(epochs) <= 20 else None)
        ax.grid(alpha=0.25)
        ax.annotate(f"{ys[-1]:.3f}", (epochs[-1], ys[-1]), textcoords="offset points", xytext=(6, 4), fontsize=9)
        if key.startswith("metrics/"):
            ax.set_ylim(0, 1)

    last = rows[-1]
    fig.suptitle(
        f"WatchDog training: {len(rows)} of 20 passes done  |  best mAP50 {float(rows[best_i]['metrics/mAP50(B)']):.3f} "
        f"at pass {epochs[best_i]} (green line, saved as best.pt)  |  last pass took {per_pass[-1] / 3600:.1f} h",
        fontsize=14, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    fig.savefig(OUT, dpi=110)
    print("Saved", OUT)
    print(f"Latest pass {epochs[-1]}: mAP50 {float(last['metrics/mAP50(B)']):.3f}, "
          f"precision {float(last['metrics/precision(B)']):.3f}, recall {float(last['metrics/recall(B)']):.3f}")


if __name__ == "__main__":
    main()
