@echo off
chcp 936 >nul
rem 双击把游戏打包成 Windows 桌面程序（双击 exe 就能玩，不用装 Node、不用开服务器）。这个文件用 GBK 编码保存（cmd 在中文 Windows 上按 GBK 读），别改成 UTF-8。
title 大肥鱼 · 一键封装
cd /d "%~dp0封装"
where node >nul 2>nul
if errorlevel 1 goto nonode
if exist "node_modules\electron\dist\electron.exe" goto build
echo 第一次封装：先下载打包工具（要联网，大概几分钟）……
call npm install
if errorlevel 1 goto fail
if not exist "node_modules\electron\dist\electron.exe" node node_modules\electron\install.js
if not exist "node_modules\electron\dist\electron.exe" goto fail
:build
echo 正在打包，大概要半分钟……
echo 打好的程序放在：桌面\28日\大肥鱼的28日成神计划\（旧的会被换掉；游戏开着的话先关掉）
echo.
node build.js --open
if errorlevel 1 goto fail
echo.
echo 打包好了，文件夹已经打开。整个文件夹拷给别人，双击里面的「大肥鱼的28日成神计划.exe」就能玩。
pause
goto :eof
:fail
echo.
echo 打包没成功，上面是出错信息。
pause
goto :eof
:nonode
echo 没找到 Node.js，请先安装：https://nodejs.org
pause
