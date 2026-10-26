@echo off
title Lehar HR (offline)
cd /d "%~dp0"
rem Stop an older copy that may still be running on port 3000
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1
if not exist node_modules (
  echo First run: installing packages - this needs internet once...
  call npm install || goto :fail
)
echo Preparing the offline database (applies any updates, keeps your data)...
call npm run offline:setup || goto :fail
echo.
echo Starting Lehar HR on http://localhost:3000  (close this window to stop)
echo Sign in with any employee email and the password firstname@KCF2026 (e.g. priya@KCF2026)
start "" cmd /c "timeout /t 15 >nul & start http://localhost:3000"
call npm run offline
goto :eof
:fail
echo.
echo Something went wrong. Scroll up for the error.
pause
