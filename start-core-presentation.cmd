@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 22 or later is required. Install Node.js and retry.
  pause
  exit /b 1
)

if not exist "node_modules\tsx" goto :install
if not exist "node_modules\basecoat-css\dist\basecoat.cdn.min.css" goto :install
goto :build

:install
(
  echo Installing Core Presentation dependencies...
  call npm.cmd ci
  if errorlevel 1 goto :failed
)

:build
echo Building Core Presentation...
call npm.cmd run build
if errorlevel 1 goto :failed

echo.
echo Core Presentation Studio is running at http://127.0.0.1:4173/
echo Keep this window open while you edit presentations.
echo To stop the application, press Ctrl+C.
echo.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "$u='http://127.0.0.1:4173/'; for($i=0;$i -lt 40;$i++){try{$r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1;if($r.StatusCode -eq 200){Start-Process $u;break}}catch{}; Start-Sleep -Milliseconds 300}"
call npm.cmd start
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo Failed to start Core Presentation. The error is shown above.
pause
exit /b 1
