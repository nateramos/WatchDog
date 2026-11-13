# WatchDog: make a preview sheet of the training images with their boxes drawn on.
# Right-click -> "Run with PowerShell" (after the training script has built the dataset).
# Opens tracking\train\dataset_preview.jpg when done.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path (Split-Path -Parent $here) ".venv-amd\Scripts\python.exe"
& $python (Join-Path $here "preview_dataset.py")
$img = Join-Path $here "dataset_preview.jpg"
if (Test-Path $img) { Start-Process $img }
Read-Host "Press Enter to close"
