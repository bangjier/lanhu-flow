@echo off
setlocal
chcp 65001 >nul 2>&1
REM LanhuFlow MCP环境配置 (Windows)

cd /d "%~dp0\.."

echo ======================================
echo LanhuFlow MCP - 环境配置
echo ======================================

if exist ".env" (
    echo [WARN] .env 文件已存在
    set /p confirm="是否覆盖？(y/N) "
    if /i not "%confirm%"=="y" (
        echo 已取消
        exit /b 0
    )
)

copy config.example.env .env
echo [OK] .env 文件已创建
echo.
echo 请编辑 .env 文件并设置 LANHU_COOKIE
echo.

pause
