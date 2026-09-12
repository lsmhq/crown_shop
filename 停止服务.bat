@echo off
title 停止服务 - 我的小店
echo 正在停止服务...
curl -s -X POST http://127.0.0.1:8765/api/system/shutdown -H "Content-Type: application/json" -d "{}" >nul 2>&1
if %errorlevel% equ 0 (
    echo 服务已停止。
) else (
    echo 未检测到运行中的服务（或端口不是8765）。
)
echo.