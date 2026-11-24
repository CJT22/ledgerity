@echo off
rem Double-click to start Ledgerity. Close this window to stop it.
title Ledgerity
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, first run only...
  call npm install
  if errorlevel 1 goto :failed
)

rem Open the browser a few seconds after the server starts
start "" cmd /c "timeout /t 4 >nul & start http://localhost:5174"

call npm start
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo Ledgerity stopped with an error. Scroll up for details.
pause
exit /b 1
