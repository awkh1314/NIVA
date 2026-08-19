$ErrorActionPreference = "Stop"
$Root = Join-Path $env:LOCALAPPDATA "NIVA\voice"
$Venv = Join-Path $Root "venv"
New-Item -ItemType Directory -Force -Path $Root | Out-Null
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Host "需要 Python 3.10+。请先安装 Python 后重新运行。" -ForegroundColor Yellow; exit 1 }
if (-not (Test-Path $Venv)) { python -m venv $Venv }
$Py = Join-Path $Venv "Scripts\python.exe"
& $Py -m pip install -U pip
& $Py -m pip install -U qwen-tts soundfile
$Server = Join-Path $PSScriptRoot "qwen_voice_server.py"
Write-Host "首次运行会从 Hugging Face 下载 Qwen3-TTS 0.6B CustomVoice（约 2.5GB）。" -ForegroundColor Cyan
& $Py $Server
