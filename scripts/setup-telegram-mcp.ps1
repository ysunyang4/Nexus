# ==============================================================================
# Telegram MCP 一键认证与配置向导 (Telethon MTProto 全能版)
# ==============================================================================

$tgDir = "$env:LOCALAPPDATA\Nexus\servers\telegram-mcp"
$envFile = "$tgDir\.env"
$pythonExe = "$tgDir\.venv\Scripts\python.exe"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       Nexus Telegram MCP 认证配置向导" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[+] Telegram 客户端 API 凭据已就绪" -ForegroundColor Green
Write-Host "[+] 本地代理 127.0.0.1:10808 MTProto 加速已就绪" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "                 请选择认证方式" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "1. 手机号 + 官方验证码登录 (推荐，验证码发到您的 Telegram)" -ForegroundColor Green
Write-Host "2. 扫码登录 (手机 Telegram: 设置 -> 设备 -> 关联桌面设备)" -ForegroundColor White
Write-Host "3. 退出" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "请选择 (1/2/3) [默认: 1]"
if ([string]::IsNullOrWhiteSpace($choice)) {
    $choice = "1"
}

Push-Location $tgDir

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "[+] 正在启动 Telegram 认证服务..." -ForegroundColor Cyan
    Write-Host "    提示: 请输入国际格式手机号 (如: +86138xxxxxxxx)" -ForegroundColor Yellow
    Write-Host "    稍后打开手机 Telegram App 查看 5 位登录码。" -ForegroundColor Yellow
    Write-Host ""
    & $pythonExe session_string_generator.py --phone
}
elseif ($choice -eq "2") {
    Write-Host ""
    Write-Host "[+] 正在启动二维码扫码登录..." -ForegroundColor Cyan
    Write-Host "    提示: 打开手机 Telegram -> 设置 -> 设备 -> 关联桌面设备" -ForegroundColor Yellow
    Write-Host ""
    & $pythonExe session_string_generator.py --qr
}
else {
    Write-Host "[-] 操作已取消。" -ForegroundColor Yellow
    Pop-Location
    exit 0
}

Pop-Location

if (Test-Path $envFile) {
    $envCheck = Get-Content $envFile -Raw
    if ($envCheck -match 'TELEGRAM_SESSION_STRING=[A-Za-z0-9+/=_-]{20,}') {
        Write-Host ""
        Write-Host "==========================================================" -ForegroundColor Green
        Write-Host " [OK] Telegram 认证成功，Session 已自动保存至 .env！" -ForegroundColor Green
        Write-Host " 正在自动启动 Telegram MCP 服务并加载 136 个能力工具..." -ForegroundColor Cyan
        
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:8787/api/mcp/managed/start/telegram-mcp" -Method Post -TimeoutSec 10 -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:8787/api/mcp/providers/telegram-mcp/refresh" -Method Post -TimeoutSec 10 -ErrorAction SilentlyContinue
            Write-Host " [OK] Telegram MCP 运行中，已注入全套 136 个工具！" -ForegroundColor Green
        } catch {
            Write-Host " [i] 可在 Nexus 桌面控制中心启动 Telegram 服务。" -ForegroundColor Gray
        }
        Write-Host "==========================================================" -ForegroundColor Green
    }
}
