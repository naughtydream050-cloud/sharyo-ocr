# BRIDGE.md — AI Collaboration Shared Context
<!-- Machine-readable sync file for Claude ↔ Gemini collaboration -->
<!-- Update this file at every milestone; timestamp format: ISO 8601 -->

Last updated: 2026-04-24T12:30:00Z
Updated by: Claude (Cowork / Dispatch) — Phase 5 Deploy Session

---

## Project Metadata

```yaml
name: sharyo-ocr
description: 手書きOCR → Excel/Wordテンプレート自動入力 SaaS
stack:
  - Next.js 14 (App Router, TypeScript)
  - Tailwind CSS v4
  - Google Gemini AI (gemini-2.0-flash-lite)
  - Stripe (Checkout, Webhooks)
  - ExcelJS (Excel fill)
  - docxtemplater + pizzip (Word fill)
  - Supabase (planned: auth + credits)
local_path: D:\Development\sharyo-ocr
deploy_target: Vercel
```

---

## Phase Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | LP + Images | ✅ Done | Hero, Pain, Solution, UseCase sections |
| 2 | Stripe Checkout | ✅ Done | Test mode verified (cs_test redirect confirmed) |
| 3 | OCR Conversion (Word/Excel) | ✅ Code Done | E2E blocked by API quota (see Known Issues) |
| 4 | Auth + Credits (Supabase) | ✅ Code Done | Google OAuth + credit guard + webhook implemented |
| 5 | Deploy (Vercel) | 🚀 Queued | deploy.bat ready — run to build+deploy. See DEPLOY_NOW.md |

---

## API Routes

| Route | Method | Purpose | Status |
|-------|--------|---------|--------|
| /api/convert | POST | OCR + template fill → file download | ✅ (+ auth + credit guard) |
| /api/checkout | POST | Stripe Checkout session | ✅ |
| /api/webhook | POST | Stripe → credit addition | ✅ |
| /api/me | GET | Current user + credits | ✅ |
| /api/auth/login | POST | Google OAuth redirect | ✅ |
| /api/auth/logout | POST | Sign out | ✅ |

---

## Known Issues / Tech Debt

```
ISSUE-001: Gemini API quota
  Model: gemini-2.0-flash-lite
  Error: 429 - limit:0 on free tier
  Root cause: API key project may need billing enabled
  Action needed: Enable billing at https://console.cloud.google.com/billing
  Workaround: Wait for daily quota reset OR enable billing

ISSUE-002: gemini-1.5-flash deprecated
  Not found on v1beta OR v1
  Fix applied: Switched to gemini-2.0-flash-lite

ISSUE-003: docxtemplater delimiter mismatch
  Default delimiters are single-brace { }
  Templates use double-brace {{ }}
  Fix applied: delimiters: { start: '{{', end: '}}' }

ISSUE-004: getWordFields raw binary scan
  buf.toString('binary') cannot find {{ }} in docx zip
  Fix applied: PizZip extracts word/document.xml before regex scan
```

---

## Phase 4 Design — Gemini Approved (2026-04-24T06:10:00Z)

### Q&A Results

| Question | Decision |
|----------|----------|
| Q1: 初期クレジット数 | **3回** — 承認 |
| Q2: サブスク中の制限 | **月次リセット方式（例：月300回）** — 無制限はAPI費用リスクあり |
| Q3: 未ログイン変換 | **不可** — 福祉データの機密性 + API乱用防止 |

### Gemini Directives for Claude
1. APIキー: Google AI Studio の Pay-as-you-go 確認。リトライロジック実装
2. Middleware guard: 変換前に credits チェック → 0以下は 403
3. UI: 残りクレジット数をLPに表示

---

## Approved Phase 4 Schema

```sql
-- Supabase / PostgreSQL

-- ユーザープロフィール（Supabase Auth の users テーブルを拡張）
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  credits INTEGER DEFAULT 3,  -- 初期無料クレジット
  plan TEXT DEFAULT 'free',   -- 'free' | 'pro'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 変換履歴ログ
CREATE TABLE conversions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  template_name TEXT,
  file_type TEXT,  -- 'xlsx' | 'docx'
  credits_used INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Stripe サブスクリプション管理
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT,  -- 'active' | 'canceled' | 'past_due'
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policy (Row Level Security)
-- profiles: 本人のみ読み書き可
-- conversions: 本人のみ読み書き可
-- subscriptions: 本人のみ読み取り可、書き込みはservice_role のみ
```

**Questions for Gemini:**
1. 初期クレジット数 (3?) は適切か？
2. サブスク有効中はクレジット無制限 or 月次リセットどちらがよいか？
3. 未ログインユーザーの変換は許可するか（フリーミアム戦略）？

---

## Env Vars Checklist

```
Required for core:
  ✅ GOOGLE_GENERATIVE_AI_API_KEY
  ✅ STRIPE_SECRET_KEY
  ✅ STRIPE_PRICE_ID
  ⬜ STRIPE_WEBHOOK_SECRET (webhook実装後に必要)
  ✅ NEXT_PUBLIC_APP_URL

Required for Phase 4 (Supabase):
  ⬜ NEXT_PUBLIC_SUPABASE_URL
  ⬜ NEXT_PUBLIC_SUPABASE_ANON_KEY
  ⬜ SUPABASE_SERVICE_ROLE_KEY
```

---

## AI Collaboration Protocol

### Sync Triggers (Claude → BRIDGE.md 更新)
- ビルド成功/失敗
- フェーズ完了
- 重大なエラー発生
- Gemini への質問が発生

### How Gemini Should Use This File
1. `Last updated` を確認して最新状態か検証
2. `Phase Status` で全体進捗を把握
3. `Known Issues` でブロッカーを確認
4. `Proposed Phase 4 Schema` の Questions に回答してユーザー経由でClaudeに伝達

### Automation Opportunities
- GitHub Actions: ビルド成功時に BRIDGE.md を自動更新
- Vercel Deployment Hook: デプロイ完了時に status 更新
- Supabase Edge Function: エラー集計をファイルに書き出し

---

## Supabase Project

```
Project ID: bsqjtibsxrljqbshgdry
URL: https://bsqjtibsxrljqbshgdry.supabase.co
Region: ap-northeast-1 (Tokyo)
Tables: profiles, conversions, subscriptions (RLS enabled)
RPC functions: decrement_credits, add_credits
Trigger: on_auth_user_created → auto-creates profiles row
```

## Phase 4 — Files Created/Modified

```
NEW: lib/supabase/admin.ts       — service role client
NEW: app/api/me/route.ts         — GET user + credits
NEW: app/api/auth/login/route.ts — Google OAuth redirect
NEW: app/api/auth/logout/route.ts
NEW: app/api/webhook/route.ts    — Stripe events handler
MOD: app/api/convert/route.ts    — auth guard + credit deduction + logging
MOD: app/page.tsx                — credits badge + login/logout in header
MOD: .env.local                  — new Supabase project URL/anon key
```

## User Action Required (Phase 4 activation)

```
1. Get service_role key from:
   https://supabase.com/dashboard/project/bsqjtibsxrljqbshgdry/settings/api
   → Paste into .env.local as SUPABASE_SERVICE_ROLE_KEY

2. Enable Google OAuth in Supabase:
   https://supabase.com/dashboard/project/bsqjtibsxrljqbshgdry/auth/providers
   → Enable Google → enter Google Client ID + Secret
   → Add redirect URL: http://localhost:3000/auth/callback

3. For Stripe webhook local test:
   stripe listen --forward-to localhost:3000/api/webhook
   → Copy whsec_... into .env.local as STRIPE_WEBHOOK_SECRET

4. Restart dev server: npm run dev
```

## Phase 5 — Deploy Readiness

```
TypeScript:    ✅ 0 errors (tsc --noEmit clean — 2026-04-24T08:00Z)
next.config:   ✅ serverExternalPackages: ['pizzip','docxtemplater']
Demo mode:     ✅ NEXT_PUBLIC_DEMO_MODE=false (flip to true for API-free testing)
npm run build: ⬜ Pending (run on Windows: cd D:\Development\sharyo-ocr && npm run build)

Files added this session:
  MOD: next.config.ts           — serverExternalPackages added
  MOD: app/api/convert/route.ts — demo mode + Uint8Array fixes
  MOD: lib/supabase/server.ts   — CookieOptions typed
  MOD: middleware.ts            — CookieOptions typed
  NEW: PHASE5_CHECKLIST.md      — full deploy checklist
  NEW: AI_TEAM_PROTOCOL.md      — autonomous AI collaboration protocol
```

## User Action Needed (Phase 5)

```
Priority 1 (do now, 5 min):
  → NEXT_PUBLIC_DEMO_MODE=true in .env.local
  → npm run dev + open http://localhost:3000
  → Upload any .docx template + any image → should download filled file (no API needed)
  → Confirms Word/Excel pipeline works end-to-end

Priority 2 (tonight):
  → Get service_role key from Supabase dashboard
  → Set up Google OAuth provider in Supabase
  → npm run build

Priority 3 (deploy day):
  → See PHASE5_CHECKLIST.md for full Vercel deploy steps
```
