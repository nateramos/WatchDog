# WatchDog: send the training set to a rented GPU (RunPod).
# Right-click -> "Run with PowerShell".
#  1. Packs the dataset into one smaller file (images capped at 1280 px; ~20-40 min, once).
#  2. Sends it with runpodctl and shows a one-time code. In the rented machine's terminal run:
#        cd /workspace && runpodctl receive <code> && tar xf watchdog_dataset.tar && rm watchdog_dataset.tar && bash pod_train.sh
#     Keep this window open until the other side says the transfer is done.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) ".venv-amd\Scripts\python.exe"
$tar = "C:\watchdog_data\upload\watchdog_dataset.tar"
$ctl = Join-Path $here "runpodctl.exe"

if (-not (Test-Path $tar)) {
    & $python (Join-Path $here "pack_for_rental.py")
    if ($LASTEXITCODE -ne 0) { Read-Host "Packing failed (see above). Press Enter"; exit 1 }
} else {
    Write-Host "Already packed: $tar (delete it to pack again)"
}

if (-not (Test-Path $ctl)) {
    Write-Host "Downloading runpodctl (RunPod's file transfer tool) from github.com/runpod/runpodctl ..."
    Invoke-WebRequest "https://github.com/runpod/runpodctl/releases/latest/download/runpodctl-windows-amd64.exe" -OutFile $ctl
}

Write-Host "`nSending. Copy the code shown below into the rented machine's terminal command:" -ForegroundColor Cyan
Write-Host "cd /workspace && runpodctl receive <code> && tar xf watchdog_dataset.tar && rm watchdog_dataset.tar && bash pod_train.sh`n" -ForegroundColor Yellow
Push-Location (Split-Path $tar)
& $ctl send (Split-Path $tar -Leaf)
Pop-Location
Read-Host "`nTransfer finished. Press Enter to close"
