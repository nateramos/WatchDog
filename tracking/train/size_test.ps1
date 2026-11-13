# WatchDog: test whether 1280px training is worth it. Right-click -> "Run with PowerShell".
# Takes about 15-25 minutes. Reads files only. Results also saved to tracking\train\size_test.log.
# Do not run while training is running on this PC.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path (Split-Path -Parent $here) ".venv-amd\Scripts\python.exe"
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
cmd /c "`"$vs\VC\Auxiliary\Build\vcvars64.bat`" >nul && set" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process") }
}
$env:MIOPEN_FIND_MODE = "FAST"; $env:MIOPEN_LOG_LEVEL = "3"
$env:PYTHONUNBUFFERED = "1"; $env:PYTHONIOENCODING = "utf-8"
& $python (Join-Path $here "size_test.py") 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath (Join-Path $here "size_test.log")
Read-Host "Press Enter to close"
