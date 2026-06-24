@echo off
setlocal
chcp 65001 >nul
title MetaBot (all services)
cd /d "%~dp0"

echo ============================================
echo            MetaBot - starting up
echo ============================================
echo.

REM ---------------------------------------------------------------
REM 1) Backend: create venv + install deps on first run
REM ---------------------------------------------------------------
if not exist "backend\.venv\Scripts\python.exe" (
    echo [setup] Creating Python virtual environment...
    pushd backend
    python -m venv .venv
    if errorlevel 1 (
        echo [error] Could not create venv. Is Python installed and on PATH?
        pause
        exit /b 1
    )
    echo [setup] Installing backend dependencies ^(first run, please wait^)...
    call .venv\Scripts\python.exe -m pip install --upgrade pip
    call .venv\Scripts\python.exe -m pip install -r requirements.txt
    popd
)

if not exist "backend\.env" (
    echo [setup] Creating backend\.env from template - EDIT IT before trading!
    copy /y "backend\.env.example" "backend\.env" >nul
)

REM ---------------------------------------------------------------
REM 2) Frontend: npm install on first run
REM ---------------------------------------------------------------
if not exist "frontend\node_modules" (
    echo [setup] Installing frontend dependencies ^(first run, please wait^)...
    pushd frontend
    call npm install
    popd
)

if not exist "frontend\.env.local" (
    echo [setup] Creating frontend\.env.local from template...
    copy /y "frontend\.env.local.example" "frontend\.env.local" >nul
)

echo.
echo [run] Starting all services in THIS single window...
echo   - API        http://127.0.0.1:8383/docs
echo   - Telegram   (polling)
echo   - Dashboard  http://localhost:4016
echo.
echo Close this window (or run stop.bat) to stop everything.
echo ============================================
echo.

REM ---------------------------------------------------------------
REM 3) Telegram bot + dashboard run in the background of THIS console;
REM    the API runs in the foreground so the window stays alive and all
REM    logs share one window.
REM ---------------------------------------------------------------
pushd "%~dp0frontend"
start /b "" cmd /c "npm run dev"
popd

pushd "%~dp0backend"
start /b "" .venv\Scripts\python.exe run_telegram.py
.venv\Scripts\python.exe run_api.py
popd

endlocal
