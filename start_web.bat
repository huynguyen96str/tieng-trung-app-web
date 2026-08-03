@echo off
echo ===========================================
echo Dang cai dat thu vien va chay ung dung Web...
echo ===========================================

cd /d "%~dp0"
call npm install
echo Thu vien da duoc cai dat. Bat dau chay Server...
call npm run dev
pause
