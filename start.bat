@echo off
rem 大肥鱼大战代码（DeepSeek vs code）一键启动
cd /d %~dp0

if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查 Node.js 是否已安装。
    pause
    exit /b 1
  )
)

echo 启动游戏服务器，浏览器将打开 http://localhost:5173/
start "" http://localhost:5173/
call npm run dev
