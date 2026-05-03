Set-Location "D:\Development\sharyo-ocr"
Write-Host "=== Git commit ===" -ForegroundColor Yellow
git add app/api/convert/route.ts
git commit -m "fix: downgrade Gemini model to gemini-1.5-flash for quota stability"

Write-Host "=== Deploying to Vercel (prod) ===" -ForegroundColor Cyan
npx vercel --prod

Write-Host "=== Done! ===" -ForegroundColor Green
