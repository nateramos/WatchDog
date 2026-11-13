# WatchDog: chart the training progress so far (safe to run while training).
# Right-click -> "Run with PowerShell". Opens tracking\train\training_progress.png.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path (Split-Path -Parent $here) ".venv-amd\Scripts\python.exe"
& $python (Join-Path $here "plot_training.py")
$img = Join-Path $here "training_progress.png"
if (Test-Path $img) { Start-Process $img }
Read-Host "Press Enter to close"
