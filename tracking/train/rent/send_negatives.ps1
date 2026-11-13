# WatchDog look-alike round: send the scripts, the 640 model and your "Not a gun" frames to RunPod.
# Right-click -> "Run with PowerShell". It shows a one-time code. In the RunPod web terminal run:
#     cd /workspace && runpodctl receive <code> && tar xf neg_kit.tar && bash pod_neg.sh
# Keep this window open until the transfer is done.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$stage = Join-Path $env:TEMP "watchdog_neg_kit"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$stage\mined" | Out-Null

foreach ($f in "pod_negatives.py", "pod_train4.py", "pod_neg.sh") {
    # Linux line endings, or bash on the pod chokes
    $text = [IO.File]::ReadAllText((Join-Path $here $f)) -replace "`r`n", "`n"
    [IO.File]::WriteAllText((Join-Path $stage $f), $text)
}
Copy-Item (Join-Path $here "models\weapons_new.pt") $stage

$mined = Get-ChildItem "$env:USERPROFILE\Downloads\watchdog_notgun_*.jpg" -ErrorAction SilentlyContinue
$mined | Copy-Item -Destination "$stage\mined"
Write-Host "Including $($mined.Count) 'Not a gun' frames from your Downloads folder."

$tar = Join-Path $here "neg_kit.tar"
tar -cf $tar -C $stage .
Write-Host "`nSending. In the RunPod web terminal run:" -ForegroundColor Cyan
Write-Host "cd /workspace && runpodctl receive <code> && tar xf neg_kit.tar && bash pod_neg.sh`n" -ForegroundColor Yellow
Push-Location $here
& (Join-Path $here "runpodctl.exe") send neg_kit.tar
Pop-Location
Read-Host "`nTransfer finished. Press Enter to close"
