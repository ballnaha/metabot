@echo off
title MetaBot Stop
echo Stopping MetaBot services...

REM Kill the python (API + Telegram) and node (dashboard) processes that
REM belong to this project, matched by their command line.
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'run_api\.py|run_telegram\.py|next(\.js)? +dev|4016' } | ForEach-Object { Write-Host ('  killing PID ' + $_.ProcessId + ' (' + $_.Name + ')'); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Done.
timeout /t 2 >nul
