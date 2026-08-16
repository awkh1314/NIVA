$ErrorActionPreference = 'Stop'

Write-Host 'NIVA DeepSeek 配置' -ForegroundColor Cyan
Write-Host 'API Key 只会写入当前 Windows 用户环境变量，不会写入仓库或脚本。'

$secureKey = Read-Host '请输入 DeepSeek API Key' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$key = $null

try {
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
    if ([string]::IsNullOrWhiteSpace($key)) {
        throw 'API Key 不能为空。'
    }

    Write-Host '正在向 DeepSeek 官方 API 验证 Key…'
    $headers = @{
        Authorization = "Bearer $key"
        Accept = 'application/json'
    }
    $balance = Invoke-RestMethod \
        -Method Get \
        -Uri 'https://api.deepseek.com/user/balance' \
        -Headers $headers \
        -TimeoutSec 20

    [Environment]::SetEnvironmentVariable('NIVA_DEEPSEEK_API_KEY', $key, 'User')

    if ($balance.is_available -eq $true) {
        Write-Host '验证成功：DeepSeek API 已接入 NIVA。' -ForegroundColor Green
    } else {
        Write-Host 'Key 验证成功，但当前账户余额不可用于 API 调用。请先检查 DeepSeek 余额。' -ForegroundColor Yellow
    }
    Write-Host '请完全退出并重新启动 NIVA，使新的环境变量生效。'
}
catch {
    Write-Host "配置失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    $key = $null
}
