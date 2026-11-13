# WatchDog: download the finished model from the rented GPU into the demo.
# On the rented machine, when the log says ALL DONE, run:
#     cd /workspace && runpodctl send weapons_new.onnx
# then run this (right-click -> "Run with PowerShell") and paste the code it showed.
# The model lands in public\models\weapons_new.onnx. Then STOP or TERMINATE the pod on runpod.io
# so it stops charging.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ctl = Join-Path $here "runpodctl.exe"
$models = Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $here))) "public\models"
$code = Read-Host "Code from the rented machine"
Push-Location $models
& $ctl receive $code.Trim()
Pop-Location
Write-Host "Saved in $models" -ForegroundColor Green
Read-Host "Press Enter to close"
