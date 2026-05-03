Set-Location "D:\Development\sharyo-ocr"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " sharyo-ocr Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Supabase PAT ──────────────────────────────────────────
Write-Host "[1/5] Supabase Personal Access Token" -ForegroundColor Yellow
Write-Host "      URL: https://supabase.com/dashboard/account/tokens"
Write-Host "      -> Generate new token を作成してください"
Write-Host ""
Start-Process "https://supabase.com/dashboard/account/tokens"
$SUPABASE_PAT = Read-Host "      PAT を貼り付けてEnter"
Write-Host ""

# ── Step 2: anon key ─────────────────────────────────────────────
Write-Host "[2/5] Supabase anon key" -ForegroundColor Yellow
Write-Host "      URL: https://supabase.com/dashboard/project/johzrpvbzlmvtvlpzmyz/settings/api"
Write-Host "      -> Project API keys > anon public"
Write-Host ""
Start-Process "https://supabase.com/dashboard/project/johzrpvbzlmvtvlpzmyz/settings/api"
$ANON_KEY = Read-Host "      anon public を貼り付けてEnter"
Write-Host ""

# ── Step 3: service_role key ──────────────────────────────────────
Write-Host "[3/5] Supabase service_role key" -ForegroundColor Yellow
Write-Host "      (same page > service_role)"
$SERVICE_ROLE_KEY = Read-Host "      service_role を貼り付けてEnter"
Write-Host ""

# ── Step 4: Google Client ID ──────────────────────────────────────
Write-Host "[4/5] Google OAuth Client ID" -ForegroundColor Yellow
Write-Host "      (Google Cloud Console で作成済みの値)"
$GOOGLE_CLIENT_ID = Read-Host "      Client ID を貼り付けてEnter"
Write-Host ""

# ── Step 5: Google Client Secret ─────────────────────────────────
Write-Host "[5/5] Google OAuth Client Secret" -ForegroundColor Yellow
$GOOGLE_CLIENT_SECRET = Read-Host "      Client Secret を貼り付けてEnter"
Write-Host ""

# ── 確認 ──────────────────────────────────────────────────────────
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " 入力値確認 (先頭のみ表示)" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ("  PAT          : " + $SUPABASE_PAT.Substring(0, [Math]::Min(8,$SUPABASE_PAT.Length)) + "...") -ForegroundColor Gray
Write-Host ("  ANON_KEY     : " + $ANON_KEY.Substring(0, [Math]::Min(12,$ANON_KEY.Length)) + "...") -ForegroundColor Gray
Write-Host ("  SERVICE_ROLE : " + $SERVICE_ROLE_KEY.Substring(0, [Math]::Min(12,$SERVICE_ROLE_KEY.Length)) + "...") -ForegroundColor Gray
Write-Host ("  GOOGLE_ID    : " + $GOOGLE_CLIENT_ID.Substring(0, [Math]::Min(10,$GOOGLE_CLIENT_ID.Length)) + "...") -ForegroundColor Gray
Write-Host ("  GOOGLE_SEC   : " + $GOOGLE_CLIENT_SECRET.Substring(0, [Math]::Min(6,$GOOGLE_CLIENT_SECRET.Length)) + "...") -ForegroundColor Gray
Write-Host ""
$confirm = Read-Host "続行しますか? (y/Enter で実行、それ以外で中断)"
if ($confirm -notin @("y","Y","")) {
    Write-Host "中断しました" -ForegroundColor Red
    exit
}

# ── Supabase: Google プロバイダー有効化 ───────────────────────────
Write-Host ""
Write-Host "=== Supabase Google Auth を有効化中..." -ForegroundColor Cyan

$authBody = @{
    external_google_enabled   = $true
    external_google_client_id = $GOOGLE_CLIENT_ID
    external_google_secret    = $GOOGLE_CLIENT_SECRET
    site_url                  = "https://sharyo-ocr.vercel.app"
    uri_allow_list            = @("https://sharyo-ocr.vercel.app/**")
} | ConvertTo-Json

try {
    $resp = Invoke-RestMethod `
        -Uri     "https://api.supabase.com/v1/projects/johzrpvbzlmvtvlpzmyz/config/auth" `
        -Method  PATCH `
        -Headers @{ "Authorization" = ("Bearer " + $SUPABASE_PAT); "Content-Type" = "application/json" } `
        -Body    $authBody
    Write-Host ("  OK Google enabled : " + $resp.external_google_enabled) -ForegroundColor Green
    Write-Host ("  OK site_url       : " + $resp.site_url) -ForegroundColor Green
} catch {
    Write-Host ("  ERROR Supabase API : " + $_) -ForegroundColor Red
    Write-Host "  PAT を再確認してください" -ForegroundColor Yellow
    exit 1
}

# ── Vercel: 環境変数を更新 ─────────────────────────────────────────
Write-Host ""
Write-Host "=== Vercel 環境変数を更新中..." -ForegroundColor Cyan

function Set-VEnv {
    param([string]$key, [string]$value)
    foreach ($e in @("production","preview","development")) {
        $tmp = [System.IO.Path]::GetTempFileName()
        Set-Content -Path $tmp -Value $value -NoNewline -Encoding utf8
        Get-Content $tmp | npx vercel env rm $key $e --yes 2>&1 | Out-Null
        Get-Content $tmp | npx vercel env add $key $e --yes 2>&1 | Out-Null
        Remove-Item $tmp -Force
    }
    Write-Host ("  OK " + $key) -ForegroundColor Green
}

Set-VEnv "NEXT_PUBLIC_SUPABASE_URL"      "https://johzrpvbzlmvtvlpzmyz.supabase.co"
Set-VEnv "NEXT_PUBLIC_SUPABASE_ANON_KEY" $ANON_KEY
Set-VEnv "SUPABASE_SERVICE_ROLE_KEY"     $SERVICE_ROLE_KEY

# ── Vercel: 本番デプロイ ───────────────────────────────────────────
Write-Host ""
Write-Host "=== 本番デプロイ中..." -ForegroundColor Cyan
npx vercel --prod

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 完了!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "-> https://sharyo-ocr.vercel.app で Google ログインを確認してください"
Start-Process "https://sharyo-ocr.vercel.app"
