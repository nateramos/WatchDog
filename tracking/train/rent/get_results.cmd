@echo off
REM Gets the look-alike model and all training charts from the RunPod pod.
REM The pod stops itself once this transfer finishes (or after 1 hour).
cd /d "%~dp0.."
set /p CODE=Code shown on the pod: 
"%~dp0runpodctl.exe" receive %CODE%
if not exist watchdog_neg_bundle.tar (echo Transfer failed. & pause & exit /b 1)
mkdir _bundle 2>nul
tar -xf watchdog_neg_bundle.tar -C _bundle
move /y _bundle\weapons_neg.onnx rent\models\ >nul
move /y _bundle\weapons_neg.pt rent\models\ >nul
xcopy /e /i /y _bundle\results_neg results_neg >nul
xcopy /e /i /y _bundle\results_960 results_960 >nul
move /y _bundle\neg_run_log.txt results_neg\ >nul
rmdir /s /q _bundle
del watchdog_neg_bundle.tar
echo Done. Model: tracking\train\rent\models\weapons_neg.onnx   Charts: tracking\train\results_neg and results_960
pause
