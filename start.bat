@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 20 或更高版本：https://nodejs.org
    pause
    exit /b 1
)

node "%~dp0core\scripts\win-launcher.js" %*
if errorlevel 1 pause
