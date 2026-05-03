@echo off
echo === Redeploying sharyo-ocr ===
cd /d "D:\Development\RAZOR_FACE_COMPANY\02_WEB_SERVICES\projects\sharyo-ocr"
npx vercel --prod
echo === Done! ===
pause
