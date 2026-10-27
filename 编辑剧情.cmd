@echo off
rem 双击打开剧情编辑器。这个文件用 GBK 编码保存（cmd 在中文 Windows 上按 GBK 读），别改成 UTF-8。
title 大肥鱼 · 剧情编辑器
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
echo 正在打开剧情编辑器，浏览器会自动打开 http://localhost:5181/
echo 用完直接关掉这个窗口就行。
echo.
node "剧情编辑器\serve.js" --open
pause
goto :eof
:nonode
echo 没找到 Node.js，请先安装：https://nodejs.org
pause
