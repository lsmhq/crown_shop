@echo off
title 我的小店 - 管理系统
echo ========================================
echo   我的小店 - 商品管理系统
echo ========================================
echo.
echo   正在启动服务...
echo.

node server/main.js

if %errorlevel% neq 0 (
    echo.
    echo [错误] 启动失败，请确保已安装 Node.js。
    echo 下载地址：https://nodejs.org/
    echo.
    pause
)