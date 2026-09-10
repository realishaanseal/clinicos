# ClinicOS - one command to set up and run everything, on Windows.
#   Right-click > Run with PowerShell, or:  powershell -ExecutionPolicy Bypass -File .\go.ps1
#
# The bash go.sh is macOS-only (brew, Ollama.app, `open`). This is its Windows twin
# and keeps the same contract: idempotent, sets up whatever is missing, then starts
# Next.js on :3000, the faster-whisper sidecar on :8756, and Ollama on :11434.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path data\audio, logs | Out-Null

function Say  { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Die  { param($m) Write-Host "`n!! $m`n" -ForegroundColor Red; exit 1 }
function Have { param($c) [bool](Get-Command $c -ErrorAction SilentlyContinue) }

if (-not (Have node))    { Die "Node.js is missing.  Install it:  winget install OpenJS.NodeJS.LTS" }
if (-not (Have python))  { Die "Python 3 is missing.  Install it:  winget install Python.Python.3.12" }

if (-not (Test-Path .env)) { Copy-Item .env.example .env; Say "created .env - set your clinic and doctor name in it" }

if (-not (Test-Path node_modules)) {
  Say "Installing app packages (a few minutes, once)"
  npm install
}

# npm 12 blocks install scripts by default, so native modules install without ever
# compiling their binary - the install "succeeds" and the app crashes later.
# package.json allowlists better-sqlite3; make sure it actually built.
node -e "require('better-sqlite3')" 2>$null
if ($LASTEXITCODE -ne 0) {
  Say "Compiling the database driver (npm skipped it)"
  npm rebuild better-sqlite3
  node -e "require('better-sqlite3')" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Die "better-sqlite3 will not load.
   Since v13 it ships N-API prebuilt binaries for every platform, so this should
   never require a compiler. Check package.json is on better-sqlite3 >=13 first:
     Remove-Item -Recurse -Force node_modules; npm install
   Only if it is pinned to v11 or older does a source build apply, which needs:
     winget install Microsoft.VisualStudio.2022.BuildTools"
  }
}

if (-not (Test-Path asr\.venv)) {
  Say "Setting up the local transcription service (once)"
  python -m venv asr\.venv
  & .\asr\.venv\Scripts\python.exe -m pip install --quiet --upgrade pip
  & .\asr\.venv\Scripts\python.exe -m pip install --quiet -r asr\requirements.txt
}

# Ollama writes the clinical notes. It may be on PATH, or installed per-user by
# winget without PATH being refreshed in this shell - check both.
$ollama = $null
if (Have ollama) { $ollama = (Get-Command ollama).Source }
else {
  foreach ($p in @("$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
                   "$env:ProgramFiles\Ollama\ollama.exe")) {
    if (Test-Path $p) { $ollama = $p; break }
  }
}
if (-not $ollama) {
  Write-Host @"

Ollama is not installed. It writes the clinical notes, and it runs entirely
on this machine.

  1. Install it:   winget install Ollama.Ollama
  2. Open a NEW terminal (so PATH refreshes)
  3. Re-run  .\go.ps1

"@
  exit 1
}

$procs = @()
function Start-Bg { param($file, $argline, $log)
  $p = Start-Process -FilePath $file -ArgumentList $argline -NoNewWindow -PassThru `
        -RedirectStandardOutput "logs\$log" -RedirectStandardError "logs\$log.err"
  $script:procs += $p; return $p
}
function Probe { param($url) try { Invoke-WebRequest $url -TimeoutSec 2 -UseBasicParsing | Out-Null; $true } catch { $false } }

try {
  if (-not (Probe 'http://127.0.0.1:11434/api/tags')) {
    Say "Starting Ollama"
    Start-Bg $ollama 'serve' 'ollama.log' | Out-Null
    Start-Sleep 3
  }

  $model = (Select-String -Path .env -Pattern '^LLM_OLLAMA_MODEL' -ErrorAction SilentlyContinue) `
             -replace '.*="?([^"]*)"?.*', '$1'
  if (-not $model) { $model = 'qwen2.5:7b-instruct' }
  if (-not (& $ollama list 2>$null | Select-String ($model -split ':')[0])) {
    Say "Downloading the language model '$model' (once, a few GB)"
    & $ollama pull $model
  }

  Say "Starting local transcription"
  Start-Bg "$PSScriptRoot\asr\.venv\Scripts\python.exe" "asr\server.py" 'asr.log' | Out-Null

  Write-Host "    waiting for the Whisper model to load" -NoNewline
  for ($i = 0; $i -lt 180; $i++) {
    if (Probe 'http://127.0.0.1:8756/health') { break }
    Write-Host '.' -NoNewline; Start-Sleep 2
  }
  Write-Host ''
  if (Probe 'http://127.0.0.1:8756/health') { Write-Host '    transcription ready' }
  else { Write-Host '    still loading - first run downloads the model. Watch: Get-Content logs\asr.log -Wait' }

  Say "Starting the app"
  $app = Start-Bg 'npm.cmd' 'run dev' 'app.log'
  Start-Sleep 5

  Write-Host "`n  ClinicOS is running:  http://localhost:3000`n"
  Write-Host "  logs:   Get-Content logs\app.log -Wait   |   Get-Content logs\asr.log -Wait"
  Write-Host "  stop:   press Ctrl-C here`n"
  Start-Process 'http://localhost:3000'

  Wait-Process -Id $app.Id
}
finally {
  Say "Shutting down"
  foreach ($p in $procs) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
}
