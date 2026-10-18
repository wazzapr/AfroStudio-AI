@echo off
setlocal
cd /d "%~dp0"
title AfroStudio AI - Windows Launcher

echo.
echo  =====================================
echo       AFROSTUDIO AI - EARLY BUILD
echo  =====================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found.
  echo Install the Node.js LTS version from https://nodejs.org/
  echo Then close this window and run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Reinstall Node.js LTS and try again.
  pause
  exit /b 1
)

echo Checking project dependencies...
if not exist "node_modules\vite\bin\vite.js" (
  echo First launch: installing dependencies. Internet access is required.
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: Dependency installation failed.
    echo Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo Starting AfroStudio AI...
echo Your browser should open at http://127.0.0.1:5173
echo Keep this window open while using the app.
echo Press Ctrl+C in this window to stop the app.
echo.
start "" "http://127.0.0.1:5173"
call npm run dev -- --host 127.0.0.1
echo.
echo AfroStudio AI has stopped.
pause
endlocal
