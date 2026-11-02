@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [提示] 未找到 Node.js，直接尝试结束 NapCat / QQ 进程
    taskkill /im NapCatWinBootMain.exe /t /f >nul 2>nul
    exit /b 0
)

node "%~dp0core\scripts\win-launcher.js" --stop
