# sharyo-ocr プロジェクト コンテキストファイル
> Gemini への引き継ぎ用。2026-04-25 時点の状態。

---

## プロジェクト概要

**アプリ名:** sharyo-ocr（手書き書類OCR → Excel/Word 自動変換 SaaS）  
**本番URL:** https://sharyo-ocr.vercel.app  
**リポジトリ:** D:\Development\sharyo-ocr  
**スタック:** Next.js 16.2.4 (App Router, TypeScript) / Supabase / Stripe / Gemini API

---

## インフラ構成

| サービス | 用途 | プロジェクトID / 識別子 |
|----------|------|------------------------|
| Vercel | ホスティング | `sharyo-ocr` (team: naughty19960502-2639s) |
| Supabase | DB + Auth | **`johzrpvbzlmvtvlpzmyz`**（※後述の重要メモ参照） |
| Stripe | 決済 | テストモード / price_1TPM0iJc9VPBxSHiRARiVxo4 |
| Google Gemini | OCR | `gemini-2.0-flash-lite` モデル使用 |
| Google OAuth | ログイン | OAuth 2.0 クライアント ID 作成済み |

---

## ⚠️ 重要メモ（致命的な修正）

途中まで **間違ったプロジェクトID `bsqjtibsxrljqbshgdry`** を使っていた。

**正しい値:**
- Supabase Project ID: `johzrpvbzlmvtvlpzmyz`
- Supabase URL: `https://johzrpvbzlmvtvlpzmyz.supabase.co`
- Google OAuth リダイレクトURI: `https://johzrpvbzlmvtvlpzmyz.supabase.co/auth/v1/callback`
- アプリ コールバックURL: `https://sharyo-ocr.vercel.app/auth/callback`

---

## 主要ファイル構成

```
sharyo-ocr/
├── app/
│   ├── api/
│   │   ├── auth/login/route.ts     # Google OAuth 開始エンドポイント
│   │   ├── convert/route.ts        # OCR → Excel/Word 変換メイン処理
│   │   └── webhook/route.ts        # Stripe webhook 処理
│   ├── auth/callback/route.ts      # OAuth コールバック（code → session）
│   └── layout.tsx / page.tsx
├── lib/supabase/
│   ├── client.ts                   # ブラウザ用 Supabase クライアント
│   ├── server.ts                   # サーバー用 (SSR cookies)
│   └── admin.ts                    # service_role 使用の管理クライアント
├── .env.local                      # ローカル開発用環境変数
├── update-supabase-project.ps1     # ★ 未実行の重要スクリプト（後述）
├── set-vercel-env.ps1              # 初期 Vercel env 登録スクリプト（実行済み）
└── vercel.json                     # Vercel ビルド設定
```

---

## 認証フロー

```
ユーザー → /api/auth/login
         → supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: origin/auth/callback })
         → Google OAuth 画面
         → /auth/callback?code=xxx
         → supabase.auth.exchangeCodeForSession(code)
         → / (ホーム)
```

コードは環境変数ベースで実装済み、変更不要。

---

## Vercel 環境変数（現在の状態）

以下は **設定済みだが一部が間違ったプロジェクトIDのまま**:

| 変数名 | 状態 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ❌ 旧ID (`bsqjt...`) のまま → 要更新 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ❌ 旧IDのキー → 要更新 |
| `SUPABASE_SERVICE_ROLE_KEY` | ❓ 未確認（未設定の可能性あり） |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ 設定済み |
| `STRIPE_SECRET_KEY` | ✅ 設定済み（テスト用） |
| `STRIPE_PRICE_ID` | ✅ 設定済み |
| `NEXT_PUBLIC_APP_URL` | ✅ `https://sharyo-ocr.vercel.app` |
| `NEXT_PUBLIC_DEMO_MODE` | ✅ `false` |
| `STRIPE_WEBHOOK_SECRET` | ❌ 未設定（Stripe CLI 実行後に取得が必要） |

---

## 現在残っているタスク（優先順）

### 🔴 最優先（これをやらないと動かない）

**`update-supabase-project.ps1` を実行する**  
`D:\Development\sharyo-ocr\update-supabase-project.ps1`

このスクリプトが以下を一括処理:
1. Supabase Management API で Google プロバイダーを有効化
2. Vercel env vars を正しいプロジェクトID に更新
3. `npx vercel --prod` で本番再デプロイ

**必要な情報（5つ）:**
- `SUPABASE_PAT` → https://supabase.com/dashboard/account/tokens
- `GOOGLE_CLIENT_ID` → 手元にあり（Google Cloud Console で作成済み）
- `GOOGLE_CLIENT_SECRET` → 手元にあり
- `ANON_KEY` → https://supabase.com/dashboard/project/johzrpvbzlmvtvlpzmyz/settings/api
- `SERVICE_ROLE_KEY` → 同上

### 🟡 デプロイ後に必要

1. **Supabase DB マイグレーション確認**  
   `profiles`, `subscriptions`, `conversions` テーブルが存在するか確認  
   `https://supabase.com/dashboard/project/johzrpvbzlmvtvlpzmyz/editor`

2. **Stripe Webhook 登録**  
   本番用: `https://sharyo-ocr.vercel.app/api/webhook` をStripeダッシュボードに登録  
   → `STRIPE_WEBHOOK_SECRET` を Vercel に設定

3. **Supabase Redirect URLs 設定**  
   `https://supabase.com/dashboard/project/johzrpvbzlmvtvlpzmyz/auth/url-configuration`  
   に `https://sharyo-ocr.vercel.app/**` を追加

---

## Supabase テーブル設計（想定）

```sql
-- profiles: ユーザープロフィール + クレジット管理
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  plan TEXT DEFAULT 'free',
  credits INT DEFAULT 5,
  stripe_customer_id TEXT,
  last_reset_at TIMESTAMPTZ
);

-- subscriptions: Stripe サブスク情報
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  stripe_subscription_id TEXT UNIQUE,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- conversions: 変換ログ
CREATE TABLE conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  template_name TEXT,
  file_type TEXT,
  credits_used INT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

RPC 関数も必要:
- `decrement_credits(user_id)` — クレジット -1
- `add_credits(user_id, amount)` — クレジット加算

---

## ローカル開発の起動方法

```bash
cd D:\Development\sharyo-ocr
npm run dev
# → http://localhost:3000
```

デモモード（Gemini APIなしでテスト）:
```
NEXT_PUBLIC_DEMO_MODE=true  # .env.local で設定済み
```

---

## package.json の主要依存関係

```json
{
  "next": "16.2.4",
  "react": "19.2.4",
  "@supabase/supabase-js": "^2.49.4",
  "@supabase/ssr": "^0.6.1",
  "stripe": "^17.7.0",
  "@google/generative-ai": "^0.24.1",
  "exceljs": "^4.4.0",
  "pizzip": "^3.2.0",
  "docxtemplater": "^3.68.5"
}
```

---

## これまでのトラブルシューティング履歴

| 問題 | 原因 | 修正 |
|------|------|------|
| Vercel ビルド失敗 | `pizzip` / `docxtemplater` が package.json に未記載 | dependencies に追加 |
| ビルド時エラー | `new Stripe(undefined)` がビルド時に throw | lazy init 関数に変更 |
| Google Auth エラー | Supabase で Google プロバイダー未有効 | → 現在対応中 |
| 間違ったプロジェクトID | `bsqjt...` を使っていた | `johzr...` に統一（修正済み） |
