@echo off
echo ==========================================
echo   sharyo-ocr Vercel Deploy Script
echo ==========================================

cd /d D:\Development\sharyo-ocr

echo.
echo [1/3] TypeScript check...
call npx tsc --noEmit
if errorlevel 1 (
  echo TypeScript errors found! Fix them before deploying.
  pause
  exit /b 1
)
echo TypeScript OK

echo.
echo [2/3] Building...
call npm run build
if errorlevel 1 (
  echo Build failed!
  pause
  exit /b 1
)
echo Build OK

echo.
echo [3/3] Deploying to Vercel (prod)...
call npx vercel --prod --yes
if errorlevel 1 (
  echo Deploy failed!
  pause
  exit /b 1
)

echo.
echo ==========================================
echo   Deploy Complete!
echo ==========================================
pause
