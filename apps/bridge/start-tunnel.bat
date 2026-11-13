@echo off
setlocal
cd /d "%~dp0"
set "TUNNEL_EXECUTABLE=cloudflared"
if defined CLOUDFLARED_EXE (
  if not exist "%CLOUDFLARED_EXE%" (
    echo Invalid CLOUDFLARED_EXE path.
    exit /b 1
  )
  set "TUNNEL_EXECUTABLE=%CLOUDFLARED_EXE%"
) else (
  where cloudflared >nul 2>&1
  if errorlevel 1 (
    echo cloudflared is not available; install or set CLOUDFLARED_EXE.
    exit /b 1
  )
)
"%TUNNEL_EXECUTABLE%" tunnel --url http://127.0.0.1:8787
