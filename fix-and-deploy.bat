@echo off
:: ============================================================
:: ⚠️ WARNING: このファイルは使用禁止です
:: 旧 Supabase プロジェクト (johzrpvbzlmvtvlpzmyz) を参照しており、
:: 現在の正しいプロジェクト (bsqjtibsxrljqbshgdry) と異なります。
:: 誤デプロイ防止のため無効化済み。
::
:: デプロイは GitHub Actions (.github/workflows/deploy.yml) で行ってください。
:: main ブランチへの push で自動デプロイされます。
:: ============================================================
exit /b 1

@echo off
cd /d "D:\Development\RAZOR_FACE_COMPANY\02_WEB_SERVICES\projects\sharyo-ocr"

echo === [1/4] Vercel env vars を johzrpvbzlmvtvlpzmyz に切り替え ===

set ANON=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvaHpycHZiemxtdnR2bHB6bXl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzQxMDcsImV4cCI6MjA5MjQxMDEwN30.6OCQyCK6IDWTy3phnoZERJFzOEO8Hdq0iwXm6lYCc1g

for %%E in (production preview development) do (
    echo https://johzrpvbzlmvtvlpzmyz.supabase.co | npx vercel env rm NEXT_PUBLIC_SUPABASE_URL %%E --yes 2>nul
    echo https://johzrpvbzlmvtvlpzmyz.supabase.co | npx vercel env add NEXT_PUBLIC_SUPABASE_URL %%E --yes
    echo %ANON% | npx vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY %%E --yes 2>nul
    echo %ANON% | npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY %%E --yes
    echo false | npx vercel env rm NEXT_PUBLIC_DEMO_MODE %%E --yes 2>nul
    echo false | npx vercel env add NEXT_PUBLIC_DEMO_MODE %%E --yes
)
echo [1/4] Done

echo.
echo === [2/4] Git commit ===
del ".git\index.lock" 2>nul
git add app/auth/auth-code-error/page.tsx app/api/me/route.ts app/api/convert/route.ts
git commit -m "fix: add auth-error page, remove admin client dependency"
echo [2/4] Done

echo.
echo === [3/4] Git push ===
git push origin main
echo [3/4] Done

echo.
echo === [4/4] Vercel 本番デプロイ ===
npx vercel --prod
echo [4/4] Done

echo.
echo === 完了! ===
echo https://sharyo-ocr.vercel.app でGoogleログインを試してください
pause
