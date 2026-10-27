@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1"
set "flat_exit_code=%ERRORLEVEL%"

if not "%flat_exit_code%"=="0" (
    echo.
    echo Flat Builder did not start. See the message above.
    pause
)

exit /b %flat_exit_code%
