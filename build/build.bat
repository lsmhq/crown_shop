@echo off
title 打包 店长宝.exe
cd /d "%~dp0"
echo ========================================
echo   打包「店长宝」管理系统
echo ========================================
echo.

REM 1. 打包服务端代码
echo [1/6] 打包服务端代码...
node build\bundle.js
if %errorlevel% neq 0 (echo 打包失败 & pause & exit /b 1)
echo.

REM 2. 生成 SEA blob
echo [2/6] 生成 SEA blob...
node --experimental-sea-config build\sea-config.json
if %errorlevel% neq 0 (echo SEA 生成失败 & pause & exit /b 1)
echo.

REM 3. 复制 node.exe
echo [3/6] 复制 node.exe...
set "NODE_PATH=%~dp0node.exe"
REM 获取当前 node.exe 路径
for /f "delims=" %%i in ('where node') do (
    set "NODE_PATH=%%i"
    goto :found
)
:found
echo 使用 node: %NODE_PATH%
copy /y "%NODE_PATH%" "店长宝.exe"
if %errorlevel% neq 0 (echo 复制失败 & pause & exit /b 1)
echo.

REM 4. 设置程序图标
echo [4/6] 设置程序图标...
if exist "12m-bundle-icon-W101.ico" (
    npx rcedit "店长宝.exe" --set-icon "12m-bundle-icon-W101.ico"
    if %errorlevel% neq 0 (echo 设置图标失败，继续打包)
) else (
    echo 未找到图标文件 12m-bundle-icon-W101.ico，跳过
)
echo.

REM 5. 注入 SEA blob
echo [5/6] 注入 SEA blob...
npx postject "店长宝.exe" NODE_SEA_BLOB dist\sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if %errorlevel% neq 0 (echo 注入失败，尝试无签名模式... & npx postject "店长宝.exe" NODE_SEA_BLOB dist\sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --no-header-strip)
if %errorlevel% neq 0 (echo 注入仍然失败 & pause & exit /b 1)
echo.

REM 6. 修改为 GUI 模式（无窗口）
echo [6/6] 修改为 GUI 模式...
node build\fix-gui.js "店长宝.exe"
if %errorlevel% neq 0 (echo 修改失败，但不影响使用（会显示控制台窗口）)
echo.

REM 压缩（可选）
REM echo 压缩中...
REM npx upx --best "店长宝.exe"

echo ========================================
echo   打包完成！
echo ========================================
echo.
echo   输出文件: 店长宝.exe
echo   程序大小:
for %%F in ("店长宝.exe") do echo     %%~zF bytes (%%~zF 字节)
echo.
echo   使用方式:
echo     1. 将 店长宝.exe 和 public 文件夹放在同一目录
echo     2. 双击 店长宝.exe 即可运行
echo     3. 数据存储在 exe 同级 data 文件夹
echo.
pause