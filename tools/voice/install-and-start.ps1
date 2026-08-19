$ErrorActionPreference = "Stop"
$Root = Join-Path $env:LOCALAPPDATA "NIVA\voice"
$Venv = Join-Path $Root "venv"
$AsrName = "vosk-model-small-cn-0.22"
$AsrDir = Join-Path $PSScriptRoot $AsrName
$AsrZip = Join-Path $Root "$AsrName.zip"
$AsrUrl = "https://alphacephei.com/vosk/models/$AsrName.zip"

New-Item -ItemType Directory -Force -Path $Root | Out-Null
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "需要 Python 3.10+。请先安装 Python 后重新运行。" -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path $Venv)) { python -m venv $Venv }
$Py = Join-Path $Venv "Scripts\python.exe"
& $Py -m pip install -U pip
& $Py -m pip install -U qwen-tts soundfile vosk

if (-not (Test-Path $AsrDir)) {
  Write-Host "正在安装 Vosk 中文离线语音识别模型（约 40MB）..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri $AsrUrl -OutFile $AsrZip
  Expand-Archive -Path $AsrZip -DestinationPath $PSScriptRoot -Force
  Remove-Item $AsrZip -Force
}

$Server = Join-Path $PSScriptRoot "qwen_voice_server.py"
Write-Host "本地语音包：Vosk 中文 ASR + Qwen3-TTS 1.7B Serena 情感语音。" -ForegroundColor Green
Write-Host "Qwen3-TTS 首次运行会下载 1.7B CustomVoice（约 4.52GB；支持情绪/风格指令）。" -ForegroundColor Cyan
& $Py $Server
