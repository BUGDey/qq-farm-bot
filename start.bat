@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "BOT_TITLE=QQ_FARM_BOT"
set "BOT_PORT=3007"
set "PNPM_CMD="

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 20 or newer: https://nodejs.org
    pause
    exit /b 1
)

REM 首次运行生成 .env（随机管理员密码）并把账号密码打印出来
if not exist "%~dp0.env" (
    echo [INFO] First run: generating .env and admin credentials...
    node "%~dp0core\scripts\init-env.js"
    if errorlevel 1 (
        echo [ERROR] Failed to create .env
        pause
        exit /b 1
    )
) else (
    echo [INFO] Found existing .env, keeping current configuration.
    echo [INFO] Admin password: see FARM_ADMIN_PASSWORD in .env
)

where pnpm >nul 2>nul
if errorlevel 1 (
    where corepack >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Neither pnpm nor corepack was found. Please install Node.js 20 or newer with corepack.
        pause
        exit /b 1
    )
    set "PNPM_CMD=corepack pnpm"
) else (
    set "PNPM_CMD=pnpm"
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%BOT_PORT%" ^| findstr "LISTENING"') do (
    echo [INFO] QQ Farm is already running. PID=%%P, PORT=%BOT_PORT%
    echo [INFO] Panel: http://localhost:%BOT_PORT%
    pause
    exit /b 0
)

if exist "%~dp0web\dist\index.html" goto runtime_deps
goto full_install

:full_install
if not exist "%~dp0core\node_modules" (
    echo [INFO] Installing workspace dependencies...
    call %PNPM_CMD% install -r
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
)
echo [INFO] Web dist not found, building once (this may take a few minutes)...
call %PNPM_CMD% -C web build
if errorlevel 1 (
    echo [ERROR] Web build failed.
    pause
    exit /b 1
)
goto launch

:runtime_deps
if not exist "%~dp0core\node_modules" (
    echo [INFO] Installing backend dependencies...
    call %PNPM_CMD% -C core install --prod
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Backend dependencies already present, skipping install.
)

:launch
echo [INFO] Opening QQ Farm console...
start "%BOT_TITLE%" cmd /k "cd /d "%~dp0" && call %PNPM_CMD% -C core dev"

echo [OK] QQ Farm launch command sent.
echo [INFO] Panel: http://localhost:%BOT_PORT%
echo [INFO] Admin account: admin (FARM_ADMIN_USERNAME in .env)
echo [INFO] Admin password: FARM_ADMIN_PASSWORD in .env (printed above on first run)
exit /b 0