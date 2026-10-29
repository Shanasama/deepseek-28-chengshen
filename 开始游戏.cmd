@echo off
chcp 936 >nul
rem 双击开始游戏（游戏本体，从标题画面开始）。这个文件用 GBK 编码保存（cmd 在中文 Windows 上按 GBK 读），别改成 UTF-8。
title 大肥鱼 · 游戏
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
echo 正在打开游戏，浏览器会自动打开 http://localhost:5181/游戏/
echo 玩的时候别关这个窗口，玩完直接关掉就行。
echo 编辑器已经开着的话，这里会直接打开游戏，然后自己退出。
echo.
node "剧情编辑器\serve.js" --open=/游戏/
pause
goto :eof
:nonode
echo 没找到 Node.js，请先安装：https://nodejs.org
pause
