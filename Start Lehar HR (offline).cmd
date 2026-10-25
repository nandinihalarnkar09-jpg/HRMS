@echo off
title Lehar HR (offline)
cd /d "%~dp0"
if not exist node_modules (
  echo First run: installing packages - this needs internet once...
  call npm install || goto :fail
)
if not exist .pglite (
  echo Creating the offline database with sample data...
  call npm run offline:setup || goto :fail
)
echo.
echo Starting Lehar HR on http://localhost:3000  (close this window to stop)
start "" cmd /c "timeout /t 12 >nul & start http://localhost:3000"
call npm run offline
goto :eof
:fail
echo.
echo Something went wrong. Scroll up for the error.
pause
