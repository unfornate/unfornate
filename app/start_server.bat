@echo off
setlocal
cd /d %~dp0
set PORT=8888
start "PDF Parser" cmd /c "python -m http.server %PORT%"
ping 127.0.0.1 -n 3 >nul
start "" "http://127.0.0.1:%PORT%/index.html"
