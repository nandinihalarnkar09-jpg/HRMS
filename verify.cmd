@echo off
rem One-click local check for Lehar HR (Windows). Writes everything to verify-log.txt
cd /d "%~dp0"
echo ==== npm install ==== > verify-log.txt
call npm install >> verify-log.txt 2>&1
echo ==== unit tests (two foreign time zones) ==== >> verify-log.txt
call npm test >> verify-log.txt 2>&1
echo ==== typecheck ==== >> verify-log.txt
call npm run typecheck >> verify-log.txt 2>&1
echo ==== build ==== >> verify-log.txt
call npm run build >> verify-log.txt 2>&1
echo ==== done ==== >> verify-log.txt
echo Finished. Results are in verify-log.txt
pause
