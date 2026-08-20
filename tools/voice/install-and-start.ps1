$ErrorActionPreference = "Stop"
$Root = Join-Path $env:LOCALAPPDATA "NIVA\asr"
$Venv = Join-Path $Root "venv"
$AsrName = "vosk-model-small-cn-0.22"
$AsrDir = Join-Path $PSScriptRoot $AsrName
$AsrZip = Join-Path $Root "$AsrName.zip"
$AsrUrl = "https://alphacephei.com/vosk/models/$AsrName.zip"

New-Item -ItemType Directory -Force -Path $Root | Out-Null
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "可选离线语音输入需要 Python 3.10+；不安装也可直接文字输入。" -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path $Venv)) { python -m venv $Venv }
$Py = Join-Path $Venv "Scripts\python.exe"
& $Py -m pip install -U pip
& $Py -m pip install -U vosk

if (-not (Test-Path $AsrDir)) {
  Write-Host "正在安装 Vosk 中文离线语音识别模型（约 40MB）..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri $AsrUrl -OutFile $AsrZip
  Expand-Archive -Path $AsrZip -DestinationPath $PSScriptRoot -Force
  Remove-Item $AsrZip -Force
}

$Server = Join-Path $PSScriptRoot "vosk_asr_server.py"
Write-Host "NIVA 默认 TTS 已内置 Kokoro INT8 / zf_001；本脚本只负责可选 Vosk 离线语音输入。" -ForegroundColor Green
& $Py $Server
