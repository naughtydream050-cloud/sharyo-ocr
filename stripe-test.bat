@echo off
echo ============================================
echo  Stripe 環境変数チェック
echo ============================================
echo.

cd /d D:\Development\sharyo-ocr

:: .env.local を読み込んで各キーを確認
set MISSING=0

findstr /i "STRIPE_SECRET_KEY=your-" .env.local >nul 2>&1
if %errorlevel%==0 (
  echo [NG] STRIPE_SECRET_KEY が未設定です（your-... のままです）
  set MISSING=1
) else (
  findstr /i "STRIPE_SECRET_KEY=" .env.local >nul 2>&1
  if %errorlevel%==0 (
    echo [OK] STRIPE_SECRET_KEY が設定されています
  ) else (
    echo [NG] STRIPE_SECRET_KEY が .env.local に存在しません
    set MISSING=1
  )
)

findstr /i "STRIPE_PRICE_ID=your-" .env.local >nul 2>&1
if %errorlevel%==0 (
  echo [NG] STRIPE_PRICE_ID が未設定です（your-... のままです）
  set MISSING=1
) else (
  findstr /i "STRIPE_PRICE_ID=" .env.local >nul 2>&1
  if %errorlevel%==0 (
    echo [OK] STRIPE_PRICE_ID が設定されています
  ) else (
    echo [NG] STRIPE_PRICE_ID が .env.local に存在しません
    set MISSING=1
  )
)

findstr /i "STRIPE_WEBHOOK_SECRET=your-" .env.local >nul 2>&1
if %errorlevel%==0 (
  echo [任意] STRIPE_WEBHOOK_SECRET が未設定（Webhook使わない場合は不要）
) else (
  findstr /i "STRIPE_WEBHOOK_SECRET=" .env.local >nul 2>&1
  if %errorlevel%==0 (
    echo [OK] STRIPE_WEBHOOK_SECRET が設定されています
  )
)

echo.
if %MISSING%==1 (
  echo ============================================
  echo  NG: Stripeのキーを .env.local に設定してください
  echo  https://dashboard.stripe.com/test/apikeys
  echo ============================================
) else (
  echo ============================================
  echo  OK: Stripe環境変数は正しく設定されています！
  echo ============================================
)
echo.
pause
