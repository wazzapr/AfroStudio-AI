# AfroStudio AI - Windows local engine setup
# This prepares the local bridge only. It deliberately does not download AI model weights.
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) { Write-Host ""; Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Warn([string]$Message) { Write-Host "WARNING: $Message" -ForegroundColor Yellow }

$EngineDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvDir = Join-Path $EngineDir ".venv"
$PythonExe = $null

Write-Step "Checking Windows and Python"
if ($env:OS -ne "Windows_NT") { throw "This setup script is for Windows." }

if (Get-Command py -ErrorAction SilentlyContinue) {
    $candidate = (& py -3 --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $candidate -match "Python 3\.(\d+)") {
        $minor = [int]$Matches[1]
        if ($minor -ge 10 -and $minor -le 13) { $PythonExe = "py -3" }
    }
}
if (-not $PythonExe -and (Get-Command python -ErrorAction SilentlyContinue)) {
    $candidate = (& python --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $candidate -match "Python 3\.(\d+)") {
        $minor = [int]$Matches[1]
        if ($minor -ge 10 -and $minor -le 13) { $PythonExe = "python" }
    }
}
if (-not $PythonExe) {
    Write-Host "Python 3.10-3.13 was not found. Install Python from https://www.python.org/downloads/windows/ and run this setup again." -ForegroundColor Red
    exit 1
}
Write-Host "Found compatible Python command: $PythonExe"

Write-Step "Checking available disk space"
$driveRoot = [System.IO.Path]::GetPathRoot($EngineDir)
$driveName = $driveRoot.TrimEnd('\').TrimEnd(':')
$drive = Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue
if ($drive) {
    $freeGB = [math]::Round($drive.Free / 1GB, 1)
    Write-Host "Free space on $driveRoot : $freeGB GB"
    if ($drive.Free -lt 5GB) { Write-Warn "Less than 5 GB is free. Do not install large model files until you free disk space." }
} else { Write-Warn "Could not determine free disk space automatically." }

Write-Step "Checking NVIDIA GPU (if available)"
$nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($nvidiaSmi) {
    $gpuInfo = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null
    if ($LASTEXITCODE -eq 0 -and $gpuInfo) {
        Write-Host $gpuInfo
        if ($gpuInfo -match "([0-9]+) MiB") {
            $vramMB = [int]$Matches[1]
            if ($vramMB -lt 4096) { Write-Warn "Detected less than 4 GB VRAM. ACE-Step 1.5 low-memory mode recommends at least 4 GB. Model installation is intentionally not automatic on this machine." }
        }
    } else { Write-Warn "NVIDIA GPU information could not be read." }
} else { Write-Warn "nvidia-smi was not found. GPU compatibility could not be verified." }

Write-Step "Preparing the AfroStudio local bridge"
if (-not (Test-Path (Join-Path $EngineDir "server.py"))) {
    throw "server.py was not found beside this setup script. Run it from the downloaded AfroStudio-AI project folder."
}
if (-not (Test-Path (Join-Path $VenvDir "Scripts\python.exe"))) {
    if ($PythonExe -eq "py -3") { & py -3 -m venv $VenvDir } else { & python -m venv $VenvDir }
    if ($LASTEXITCODE -ne 0) { throw "Could not create the local Python environment." }
}
$venvPython = Join-Path $VenvDir "Scripts\python.exe"
& $venvPython -c "import http.server, json, urllib.request; print('Python standard-library checks passed.')"
if ($LASTEXITCODE -ne 0) { throw "Python environment check failed." }

Write-Host ""
Write-Host "Local bridge setup is ready." -ForegroundColor Green
Write-Host "The bridge uses Python's standard library; no pip packages are required."
Write-Warn "This does NOT install ACE-Step or download music-generation models. The AI model setup is not yet safe to automate for every PC, especially GPUs with 2 GB VRAM."
$answer = Read-Host "Start the local bridge now? (Y/N)"
if ($answer -match '^(y|yes)$') {
    Write-Host "Keep this window open while using the local bridge. Press Ctrl+C to stop it."
    & $venvPython (Join-Path $EngineDir "server.py")
}
