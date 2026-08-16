param(
    [int]$Minutes = 120,
    [int]$IntervalSeconds = 30,
    [string]$Output = ""
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Output)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $Output = Join-Path $PWD "niva-soak-$stamp.csv"
}

$process = Get-Process -Name 'niva' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $process) {
    throw '没有找到正在运行的 niva.exe。请先启动 NIVA，再运行本脚本。'
}

$logicalProcessors = [Math]::Max(1, [Environment]::ProcessorCount)
$startedAt = Get-Date
$deadline = $startedAt.AddMinutes($Minutes)
$lastSampleAt = $startedAt
$lastCpu = [double]$process.CPU
if ($null -eq $process.CPU) { $lastCpu = 0.0 }
$initialWorkingSetMb = [Math]::Round($process.WorkingSet64 / 1MB, 2)
$peakWorkingSetMb = $initialWorkingSetMb
$peakPrivateMb = [Math]::Round($process.PrivateMemorySize64 / 1MB, 2)
$sampleCount = 0
$cpuTotal = 0.0

Write-Host 'NIVA MVP soak test' -ForegroundColor Cyan
Write-Host "PID: $($process.Id)"
Write-Host "Duration: $Minutes minutes"
Write-Host "Interval: $IntervalSeconds seconds"
Write-Host "CSV: $Output"
Write-Host "Initial working set: $initialWorkingSetMb MB"

"timestamp,elapsed_min,cpu_percent,working_set_mb,private_mb,handles,threads" | Set-Content -Path $Output -Encoding UTF8

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds $IntervalSeconds

    $now = Get-Date
    $current = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
    if (-not $current) {
        Write-Host 'FAIL: NIVA process exited during soak test.' -ForegroundColor Red
        exit 2
    }

    $currentCpu = [double]$current.CPU
    if ($null -eq $current.CPU) { $currentCpu = $lastCpu }
    $elapsedSeconds = [Math]::Max(0.1, ($now - $lastSampleAt).TotalSeconds)
    $cpuDelta = [Math]::Max(0, $currentCpu - $lastCpu)
    $cpuPercent = [Math]::Round(($cpuDelta / $elapsedSeconds / $logicalProcessors) * 100, 2)
    $workingSetMb = [Math]::Round($current.WorkingSet64 / 1MB, 2)
    $privateMb = [Math]::Round($current.PrivateMemorySize64 / 1MB, 2)
    $elapsedMin = [Math]::Round(($now - $startedAt).TotalMinutes, 2)

    $peakWorkingSetMb = [Math]::Max($peakWorkingSetMb, $workingSetMb)
    $peakPrivateMb = [Math]::Max($peakPrivateMb, $privateMb)
    $sampleCount += 1
    $cpuTotal += $cpuPercent

    $line = '{0},{1},{2},{3},{4},{5},{6}' -f $now.ToString('s'), $elapsedMin, $cpuPercent, $workingSetMb, $privateMb, $current.Handles, $current.Threads.Count
    Add-Content -Path $Output -Value $line -Encoding UTF8

    Write-Host ("[{0,6} min] CPU {1,6}% | WS {2,8} MB | Private {3,8} MB" -f $elapsedMin, $cpuPercent, $workingSetMb, $privateMb)

    $lastCpu = $currentCpu
    $lastSampleAt = $now
}

$averageCpu = 0.0
if ($sampleCount -gt 0) {
    $averageCpu = [Math]::Round($cpuTotal / $sampleCount, 2)
}
$growthRatio = 0.0
if ($initialWorkingSetMb -gt 0) {
    $growthRatio = [Math]::Round($peakWorkingSetMb / $initialWorkingSetMb, 2)
}

Write-Host ''
Write-Host 'PASS: NIVA remained alive for the requested soak duration.' -ForegroundColor Green
Write-Host "Average sampled CPU: $averageCpu%"
Write-Host "Peak working set: $peakWorkingSetMb MB"
Write-Host "Peak private memory: $peakPrivateMb MB"
Write-Host "Peak/initial working-set ratio: ${growthRatio}x"
Write-Host "Log saved to: $Output"

if ($peakWorkingSetMb -gt 1200 -or $growthRatio -gt 2.5) {
    Write-Host 'WARN: memory growth exceeded the current MVP review threshold; inspect the CSV before release.' -ForegroundColor Yellow
    exit 3
}

exit 0
