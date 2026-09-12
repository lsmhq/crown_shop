@echo off
title 实时日志 - 我的小店
echo ========================================
echo   实时日志查看器
echo   按 Ctrl+C 停止
echo ========================================
echo.
if not exist "logs\app.log" (
    echo [提示] 日志文件尚未生成，请先启动 店长宝.exe
    echo.
    pause
    exit /b
)
echo 日志文件: logs\app.log
echo 显示最近 100 行后持续监听...
echo ------------------------------------------------
powershell -Command "Get-Content -Path 'logs\app.log' -Tail 100 -Wait -ErrorAction SilentlyContinue"