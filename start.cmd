@echo off
rem ============================================
rem  JLPT Reading Trainer - one-click launcher
rem  Usage: start.cmd [port]   (default 8080)
rem  NOTE: keep this file ASCII-only.
rem ============================================
setlocal

set PORT=8080
if not "%~1"=="" set PORT=%~1

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install it first: https://nodejs.org/
  pause
  exit /b 1
)

cd /d "%~dp0"
echo Starting local server on port %PORT% ...

rem Launch server in a new window; closing that window stops the server
start "JLPT Reading Server" cmd /k "chcp 65001 >nul && node server.js %PORT%"

rem Give the server a moment, then open the browser
timeout /t 1 /nobreak >nul
start "" "http://localhost:%PORT%"

rem Get LAN IPv4 address (fallback: 127.0.0.1)
set LANIP=
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$c=Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway }; if($c){ $c[0].IPv4Address.IPAddress } else { '127.0.0.1' }"`) do set LANIP=%%i
if not defined LANIP set LANIP=127.0.0.1

echo Browser opened: http://localhost:%PORT%
echo.
echo  ==============================================
echo   Phone access (same Wi-Fi):
echo   http://%LANIP%:%PORT%
echo  ==============================================
echo.
endlocal
