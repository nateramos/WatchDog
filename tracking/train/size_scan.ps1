# WatchDog: exact size of every training image. Right-click -> "Run with PowerShell". ~2-5 minutes.
# Reads files only. Safe to run anytime (no GPU). Results also saved to tracking\train\size_scan.log.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path (Split-Path -Parent $here) ".venv-amd\Scripts\python.exe"
$env:PYTHONIOENCODING = "utf-8"
& $python (Join-Path $here "size_scan.py") 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath (Join-Path $here "size_scan.log")
Read-Host "Press Enter to close"
