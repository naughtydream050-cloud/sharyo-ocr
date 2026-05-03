# PHASE5_CHECKLIST.md — デプロイ後の手動設定リスト

Generated: 2026-04-24
Author: Claude (Cowork)

---

## ✅ 自動完了済み（Claude が対応済み）

- [x] TypeScript エラー 0 件（`tsc --noEmit` クリーン）
- [x] `next.config.ts` — `serverExternalPackages: ['pizzip', 'docxtemplater']` 設定済み
- [x] デモモード実装 — `NEXT_PUBLIC_DEMO_MODE=true` で Gemini API 不要でテスト可能
- [x] Supabase プロジェクト作成（東京リージョン）+ スキーマ適用済み
- [x] RPC関数 `decrement_credits` / `add_credits` 適用済み
- [x] Phase 4 コード実装完了（認証・クレジット・Webhook）

---

## 🔲 あなたが実施する項目（帰宅後）

### 1. Supabase 設定

- [ ] **service_role キー取得 → .env.local に設定**
  ```
  URL: https://supabase.com/dashboard/project/bsqjtibsxrljqbshgdry/settings/api
  キー名: service_role (secret)
  .env.local の SUPABASE_SERVICE_ROLE_KEY= に貼り付け
  ```

- [ ] **Google OAuth 有効化**
  ```
  URL: https://supabase.com/dashboard/project/bsqjtibsxrljqbshgdry/auth/providers
  1. Google を有効化
  2. Google Cloud Console で OAuth 2.0 クライアント ID 作成
     - 承認済みリダイレクト URI: https://bsqjtibsxrljqbshgdry.supabase.co/auth/v1/callback
  3. Client ID / Secret を Supabase に入力
  4. Supabase の Redirect URL を確認してコピー
  5. .env.local の NEXT_PUBLIC_APP_URL を本番URLに変更（Vercel デプロイ後）
  ```

### 2. ローカル動作確認

- [ ] **デモモードでテスト（API不要）**
  ```
  .env.local: NEXT_PUBLIC_DEMO_MODE=true
  npm run dev → ブラウザでWord/Excelテンプレートをアップ → 変換 → ダウンロード確認
  成功後: NEXT_PUBLIC_DEMO_MODE=false に戻す
  ```

- [ ] **Stripe Webhook ローカルテスト**
  ```
  stripe listen --forward-to localhost:3000/api/webhook
  → whsec_... を .env.local の STRIPE_WEBHOOK_SECRET= に貼り付け
  → stripe trigger checkout.session.completed でテスト
  ```

- [ ] **npm run build** でビルドエラーがないことを確認
  ```
  cd D:\Development\sharyo-ocr
  npm run build
  ```

### 3. Vercel デプロイ

- [ ] **Vercel プロジェクト作成 / GitHub 連携**
  ```
  vercel.com/new → GitHub リポジトリ選択 → sharyo-ocr
  Framework Preset: Next.js（自動検出）
  ```

- [ ] **Vercel 環境変数設定**（以下を全て入力）
  ```
  NEXT_PUBLIC_SUPABASE_URL         = https://bsqjtibsxrljqbshgdry.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY    = eyJhbGci... (Supabase dashboard から)
  SUPABASE_SERVICE_ROLE_KEY        = eyJhbGci... (secret)
  GOOGLE_GENERATIVE_AI_API_KEY     = AIzaSy...
  STRIPE_SECRET_KEY                = sk_live_... (本番キー)
  STRIPE_PRICE_ID                  = price_...
  STRIPE_WEBHOOK_SECRET            = whsec_... (Vercel webhook用、下記で取得)
  NEXT_PUBLIC_APP_URL              = https://your-app.vercel.app
  NEXT_PUBLIC_DEMO_MODE            = false
  ```

- [ ] **初回デプロイ実行** → URL 確認

### 4. Stripe 本番 Webhook 設定

- [ ] **Vercel デプロイ後に Webhook URL を登録**
  ```
  Stripe Dashboard → Developers → Webhooks → Add endpoint
  URL: https://your-app.vercel.app/api/webhook
  Events: checkout.session.completed, invoice.payment_succeeded, customer.subscription.deleted
  → Signing secret (whsec_...) を Vercel 環境変数 STRIPE_WEBHOOK_SECRET に設定
  ```

### 5. Supabase Auth リダイレクト URL 追加

- [ ] **本番 URL を Supabase に追加**
  ```
  URL: https://supabase.com/dashboard/project/bsqjtibsxrljqbshgdry/auth/url-configuration
  Redirect URLs に追加: https://your-app.vercel.app/auth/callback
  ```

### 6. Gemini API 課金設定（Phase 3 E2E テスト用）

- [ ] **Pay-as-you-go を有効化**
  ```
  URL: https://console.cloud.google.com/billing
  プロジェクト: gen-lang-client-0156619288
  課金アカウントに紐付け → Gemini API の quota が解除される
  ```

---

## 推奨デプロイ順序

```
1. npm run build （ローカルでビルド確認）
2. NEXT_PUBLIC_DEMO_MODE=true でローカル E2E テスト
3. Supabase Google OAuth 設定
4. Vercel プロジェクト作成 + 環境変数設定
5. 初回デプロイ
6. Stripe Webhook URL 登録
7. 本番で決済テスト（Stripe テストモード）
8. Gemini API 課金有効化 → OCR E2E テスト
9. Stripe 本番モードに切り替え（sk_live_...）
```

---

## 緊急時のロールバック

```bash
# Vercel でワンクリックロールバック可能
# または: vercel rollback
```
