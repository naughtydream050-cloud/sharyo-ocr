# sharyo-ocr AGENTS.md

## 概要
書類・帳票の写真をGoogle Gemini AI (gemini-2.0-flash-lite) でOCR読み取りし、
Word(.docx) または Excel(.xlsx) テンプレートの `{{フィールド名}}` を自動入力して出力するSaaS。

**本番URL**: https://sharyo-ocr.vercel.app

---

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フレームワーク | Next.js 16 (App Router) + TypeScript strict |
| スタイリング | Tailwind CSS v4 (@tailwindcss/postcss) |
| AI / OCR | Google Gemini `gemini-2.0-flash-lite` (@google/generative-ai ^0.24) |
| 認証 / DB | Supabase (@supabase/ssr ^0.6) — project: `bsqjtibsxrljqbshgdry` (東京) |
| 決済 | Stripe ^17 |
| ホスティング | Vercel Hobby (projectId: `prj_NLL68B6QeuHPkoIUQ05UGTrIIscM`) |
| 画像処理 | Sharp (server-side) + browser-image-compression (client-side) |
| ドキュメント出力 | docxtemplater + pizzip (Word), ExcelJS (Excel) |

---

## ファイル構成

```
app/
  page.tsx              — メインUI（ファイルアップ・変換・認証・クレジット表示）
  layout.tsx            — ルートレイアウト
  globals.css           — Tailwind グローバルスタイル
  auth/
    callback/route.ts   — Supabase OAuth コールバック
    auth-code-error/    — OAuth エラーページ
  api/
    convert/route.ts    — ★メイン: OCR → Word/Excel 埋め込み (maxDuration=60)
    me/route.ts         — ユーザー情報・クレジット取得
    checkout/route.ts   — Stripe Checkout セッション作成
    webhook/route.ts    — Stripe Webhook ハンドラ
    auth/login/         — Supabase Google ログイン
    corrections/        — OCR結果の手動修正
    excel/export/       — Excel 専用エクスポート
  components/
    OcrFillPreview.tsx  — OCR結果プレビューコンポーネント
lib/
  supabase/
    client.ts           — ブラウザ用クライアント
    server.ts           — SSR用 (cookies)
    admin.ts            — service_role クライアント（サーバーサイド専用）
  base-url.ts           — APP_URL ヘルパー
middleware.ts           — Supabase Auth セッション更新
```

---

## Supabase スキーマ (project: bsqjtibsxrljqbshgdry)

### profiles
| カラム | 型 | デフォルト | 説明 |
|--------|-----|-----------|------|
| id | uuid | — | auth.users.id FK |
| email | text | — | メールアドレス |
| credits | integer | 3 | 残クレジット |
| plan | text | 'free' | 'free' \| 'pro' |
| stripe_customer_id | text | — | Stripe顧客ID |
| last_reset_at | timestamptz | now() | クレジットリセット日時 |

### conversions
| カラム | 型 | デフォルト | 説明 |
|--------|-----|-----------|------|
| id | uuid | gen_random_uuid() | — |
| user_id | uuid | — | profiles.id FK |
| template_name | text | — | テンプレートファイル名 |
| file_type | text | — | 'docx' \| 'xlsx' |
| credits_used | integer | 1 | 消費クレジット数 |
| status | text | 'success' | 'success' \| 'error' |

### subscriptions
Stripeサブスク状態（stripe_subscription_id, status, current_period_end）

---

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ | Google AI Studio で取得 |
| `STRIPE_SECRET_KEY` | ✅ | sk_test_... or sk_live_... |
| `STRIPE_PRICE_ID` | ✅ | price_... |
| `STRIPE_WEBHOOK_SECRET` | ✅ | whsec_... |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | https://bsqjtibsxrljqbshgdry.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service_role key（サーバーのみ） |
| `NEXT_PUBLIC_APP_URL` | ✅ | https://sharyo-ocr.vercel.app |
| `NEXT_PUBLIC_DEMO_MODE` | — | true のとき Gemini API 不使用でモックデータ返却 |

---

## コーディングルール

1. **TypeScript strict 維持**: `tsc --noEmit` でエラー0件を保つこと
2. **Supabase操作**: `lib/supabase/admin.ts` (service_role) はサーバーサイドのみ使用
3. **クレジット消費**: `conversions` テーブルへの INSERT と `profiles.credits` デクリメントを同時実行
4. **maxDuration**: `app/api/convert/route.ts` の `export const maxDuration = 60` は Vercel Hobby 制限のため変更不可
5. **DEMO_MODE**: `NEXT_PUBLIC_DEMO_MODE=true` のとき Gemini API を呼ばず固定データを返すフォールバックを維持
6. **PRルール**: `main` ブランチへのマージ前にビルド成功必須 (`npm run build`)
7. **セキュリティ**: `.env.local` をコミットしないこと。secret key をコードにハードコードしないこと

---

## ローカル開発

```bash
# 1. 依存インストール
npm install

# 2. 環境変数設定
cp .env.example .env.local
# .env.local に各値を設定

# 3. デモモードで起動（Gemini API不要）
NEXT_PUBLIC_DEMO_MODE=true npm run dev

# 4. ビルド確認
npm run build
```

---

## デプロイ

GitHub Actions (`.github/workflows/deploy.yml`) により `main` push で自動デプロイ。

必要な GitHub Secrets:
- `VERCEL_TOKEN` — https://vercel.com/account/tokens
- `VERCEL_ORG_ID` — `team_Mjv6HGgGGJ7rsRGKaRjHZLda`
- `VERCEL_PROJECT_ID` — `prj_NLL68B6QeuHPkoIUQ05UGTrIIscM`
