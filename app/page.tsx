'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import imageCompression from 'browser-image-compression';

async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.9,
      maxWidthOrHeight: 2000,
      useWebWorker: true,
      fileType: 'image/jpeg',
      initialQuality: 0.85,
    });
    return new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file; // 失敗時はオリジナルを使用
  }
}

type UserInfo = { id: string; email: string } | null;

export default function Home() {
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [imageFile,    setImageFile]    = useState<File | null>(null);
  const [compressing,  setCompressing]  = useState(false);
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState('');
  const [done,         setDone]         = useState('');

  const [checkoutBusy,  setCheckoutBusy]  = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  // ── 認証 / クレジット状態 ───────────────────────────────────────
  const [user,    setUser]    = useState<UserInfo>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [plan,    setPlan]    = useState<string>('free');
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => {
      setUser(d.user);
      setCredits(d.credits);
      setPlan(d.plan ?? 'free');
    }).catch(() => {});
  }, [done]); // done 変化時に再取得（変換後にクレジット更新）

  const handleLogin = async () => {
    setAuthBusy(true);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST' });
      const j = await res.json();
      if (j.url) window.location.href = j.url;
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null); setCredits(null); setPlan('free');
  };

  const isPro = plan === 'pro';
  const canConvert = !!(templateFile && imageFile && !busy && !compressing && user && (isPro || (credits ?? 0) > 0));

  // ── OCR変換 ────────────────────────────────────────────────────────
  const handleConvert = async () => {
    if (!canConvert) return;
    setBusy(true); setCompressing(true); setError(''); setDone('');
    let compressedImage: File = imageFile!;
    try {
      compressedImage = await compressImageFile(imageFile!);
    } catch {
      // 圧縮失敗時はオリジナルを使用
    } finally {
      setCompressing(false);
    }
    try {
      const fd = new FormData();
      fd.append('template', templateFile!);
      fd.append('image',    compressedImage);
      const res = await fetch('/api/convert', { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `filled_${templateFile!.name}`;
      a.click();
      URL.revokeObjectURL(url);
      setDone('変換完了！ファイルのダウンロードが開始されました。');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Stripe Checkout ────────────────────────────────────────────────
  const handleCheckout = async () => {
    setCheckoutBusy(true); setCheckoutError('');
    try {
      const res = await fetch('/api/checkout', { method: 'POST' });
      const j   = await res.json();
      if (!res.ok || !j.url) throw new Error(j.error ?? `HTTP ${res.status}`);
      window.location.href = j.url;
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : String(e));
      setCheckoutBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <span className="font-extrabold text-slate-800 text-lg tracking-tight">📋 手書き変換ツール</span>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {credits !== null && (
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  isPro ? 'bg-purple-100 text-purple-700' :
                  credits > 5 ? 'bg-emerald-100 text-emerald-700' :
                  credits > 0 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-600'
                }`}>
                  {isPro ? '✨ 無制限 (Pro)' : `🪙 残り${credits}回`}
                </span>
              )}
              <span className="text-xs text-slate-500 hidden sm:block max-w-[140px] truncate">{user.email}</span>
              <button onClick={handleLogout}
                className="text-xs text-slate-500 hover:text-red-500 transition-colors font-medium">
                ログアウト
              </button>
            </>
          ) : (
            <button onClick={handleLogin} disabled={authBusy}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-full transition-colors disabled:opacity-60">
              {authBusy ? '...' : 'Googleでログイン'}
            </button>
          )}
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-300 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-20 flex flex-col md:flex-row items-center gap-10">

          {/* 左：テキスト + 手軽＆簡単バッジ画像 */}
          <div className="flex-1 text-center md:text-left">
            {/* 手軽＆簡単！吹き出し（左上に配置） */}
            <div className="flex justify-center md:justify-start mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero_comic_v2_nobg.png"
                alt="手軽＆簡単！"
                style={{width: '180px', height: 'auto'}}
              />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
              手書き書類<br />ファイル変換
            </h1>
            <p className="text-blue-100 text-lg leading-relaxed mb-8 max-w-xl">
              現場の指定フォーマット（Word/Excel）に、手書きの文字をそのままデジタル化して流し込みます。
            </p>
            <div className="flex flex-wrap gap-3 justify-center md:justify-start mb-8">
              <span className="bg-white/20 backdrop-blur px-4 py-1.5 rounded-full text-sm font-medium">✅ Excel対応</span>
              <span className="bg-white/20 backdrop-blur px-4 py-1.5 rounded-full text-sm font-medium">✅ Word対応</span>
              <span className="bg-white/20 backdrop-blur px-4 py-1.5 rounded-full text-sm font-medium">✅ 手書き対応</span>
            </div>
            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
              <button
                onClick={handleCheckout}
                disabled={checkoutBusy}
                className="inline-block bg-white text-blue-700 font-bold px-8 py-4 rounded-full shadow-2xl hover:bg-blue-50 transition-all active:scale-95 text-base disabled:opacity-60">
                {checkoutBusy ? '⏳ リダイレクト中...' : '今すぐ試す →'}
              </button>
              <a href="#tool"
                className="inline-block border-2 border-white/60 text-white font-semibold px-8 py-4 rounded-full hover:bg-white/10 transition-all active:scale-95 text-base">
                無料で試す →
              </a>
            </div>
            {checkoutError && (
              <p className="mt-4 text-yellow-300 text-sm font-medium bg-black/20 px-4 py-2 rounded-xl inline-block">
                ⚠️ {checkoutError}
              </p>
            )}
          </div>

          {/* 右：「長時間の打ち込みとはおさらば！」吹き出し */}
          <div className="flex-shrink-0 flex items-center justify-center" style={{minWidth: '260px', maxWidth: '360px', width: '100%'}}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero_right_nobg.png"
              alt="長時間の打ち込みとはおさらば！自動でファイルへ反映！"
              style={{width: '100%', height: 'auto', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.35))'}}
            />
          </div>
        </div>
      </section>

      {/* ── Pain セクション ─────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white text-center">
        <p className="text-red-500 text-xs font-bold uppercase tracking-widest mb-2">Problem</p>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-700 mb-3">こんな悩み、ありませんか？</h2>
        <p className="text-slate-400 text-sm mb-12">現場でよくある、面倒な転記作業</p>
        <div className="max-w-4xl mx-auto rounded-3xl overflow-hidden shadow-xl border border-slate-100">
          <Image
            src="/pain.png"
            alt="手書きで打ち込むの面倒くさい…"
            width={1200}
            height={675}
            className="w-full h-auto"
            priority
          />
        </div>
      </section>

      {/* ── Solution セクション ─────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gradient-to-b from-blue-50 to-slate-50 text-center">
        <p className="text-emerald-600 text-xs font-bold uppercase tracking-widest mb-2">Solution</p>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-700 mb-3">
          AIがあなたのファイルに自動で書き込む！！
        </h2>
        <p className="text-slate-400 text-sm mb-12">写真を撮るだけで、フォーマットへの転記が完了</p>
        <div className="max-w-4xl mx-auto rounded-3xl overflow-hidden shadow-xl bg-white p-8 md:p-16 flex items-center justify-center border border-blue-100">
          <Image
            src="/solution_comic.png"
            alt="AIがあなたのファイルに自動で書き込む!!"
            width={800}
            height={600}
            className="w-full max-w-lg h-auto drop-shadow-2xl"
          />
        </div>
      </section>

      {/* ── 3-Step Tool ────────────────────────────────────────────── */}
      <section id="tool" className="py-24 px-6 bg-white scroll-mt-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-blue-600 text-xs font-bold uppercase tracking-widest mb-2 text-center">How it works</p>
          <h2 className="text-3xl font-extrabold text-center text-slate-800 mb-2">3ステップで完了</h2>
          <p className="text-center text-slate-400 text-sm mb-12">シンプルな操作で手書き→デジタルを実現</p>

          <div className="space-y-5">

            {/* Step 1 */}
            <div className="flex gap-5 items-start p-6 rounded-2xl border-2 border-blue-100 bg-blue-50 hover:border-blue-300 transition-colors">
              <div className="w-12 h-12 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-extrabold shadow-md">1</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-800 mb-1">ベースとなる Word / Excel を選択</h3>
                <p className="text-xs text-slate-500 mb-1">
                  書き込み先のファイルを選んでください。
                </p>
                <p className="text-xs text-slate-500 mb-3">
                  Wordテンプレート内の
                  <code className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono mx-1 text-xs border border-blue-200">{'{{タグ}}'}</code>
                  に自動流し込みされます。（例：
                  <code className="bg-blue-100 text-blue-700 px-1 rounded font-mono text-xs">{'{{name}}'}</code>
                  <code className="bg-blue-100 text-blue-700 px-1 rounded font-mono text-xs ml-1">{'{{date}}'}</code>
                  ）
                </p>
                <label className="cursor-pointer">
                  <input type="file" accept=".xlsx,.xls,.docx" className="hidden"
                    onChange={e => setTemplateFile(e.target.files?.[0] ?? null)} />
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow">
                    📁 ファイルを選択
                  </span>
                </label>
                {templateFile && <p className="mt-2 text-xs text-green-600 font-semibold">✓ {templateFile.name}</p>}
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-5 items-start p-6 rounded-2xl border-2 border-indigo-100 bg-indigo-50 hover:border-indigo-300 transition-colors">
              <div className="w-12 h-12 shrink-0 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-extrabold shadow-md">2</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-800 mb-1">手書きした写真をアップロード</h3>
                <p className="text-xs text-slate-500 mb-3">
                  スマホで撮影した手書き書類の写真を選んでください。JPG・PNG対応。Gemini AIが文字を自動認識します。
                </p>
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => setImageFile(e.target.files?.[0] ?? null)} />
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow">
                    📸 写真を選択
                  </span>
                </label>
                {imageFile && <p className="mt-2 text-xs text-green-600 font-semibold">✓ {imageFile.name}</p>}
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-5 items-start p-6 rounded-2xl border-2 border-emerald-100 bg-emerald-50 hover:border-emerald-300 transition-colors">
              <div className="w-12 h-12 shrink-0 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xl font-extrabold shadow-md">3</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-800 mb-1">変換＆ダウンロード</h3>
                <p className="text-xs text-slate-500 mb-4">
                  AIが手書き文字を認識し、
                  <code className="bg-emerald-100 text-emerald-700 px-1 rounded font-mono text-xs mx-1">{'{{タグ}}'}</code>
                  の箇所に自動で書き込んでダウンロードします。
                </p>
                <button onClick={handleConvert} disabled={!canConvert}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-base transition-all ${
                    canConvert
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200 hover:scale-105 active:scale-95'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}>
                  {compressing ? '🗜️ 画像圧縮中...' : busy ? '⏳ AI変換中...' : '✨ 変換してダウンロード'}
                </button>
                {!user && (
                  <p className="mt-2 text-xs text-orange-500 font-medium">
                    ⚠️ <button onClick={handleLogin} className="underline">Googleでログイン</button>してから変換できます
                  </p>
                )}
                {user && !isPro && (credits ?? 0) <= 0 && (
                  <p className="mt-2 text-xs text-red-600 font-medium">
                    ⚠️ 本日の無料枠（1回）を使い切りました。明日リセットされます。
                    <button onClick={handleCheckout} className="ml-1 underline font-bold">Proプランで無制限に</button>
                  </p>
                )}
                {user && (credits ?? 0) > 0 && (!templateFile || !imageFile) && !busy && (
                  <p className="mt-2 text-xs text-slate-400">※ ステップ1・2を完了してください</p>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              ❌ <strong>エラー：</strong>{error}
            </div>
          )}
          {done && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-semibold">
              ✅ {done}
            </div>
          )}
        </div>
      </section>

      {/* ── Use Case セクション（フッター手前）─────────────────────── */}
      <section className="py-24 px-6 bg-slate-100 text-center">
        <p className="text-blue-600 text-xs font-bold uppercase tracking-widest mb-2">Use Cases</p>
        <h2 className="text-3xl font-extrabold text-slate-700 mb-3">いつでもどこでも、手書き書類をデジタル化</h2>
        <p className="text-slate-400 text-sm mb-12">現場・移動中・在宅どこでも即座に対応</p>
        <div className="max-w-4xl mx-auto rounded-3xl overflow-hidden shadow-xl border border-slate-200">
          <Image
            src="/use_case.png"
            alt="いつでもどこでも、手書き書類をデジタル化"
            width={1200}
            height={600}
            className="w-full h-auto"
          />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="py-10 px-6 bg-slate-800 text-center text-sm">
        <p className="text-slate-200 font-bold mb-1">📋 手書き書類ファイル変換ツール</p>
        <p className="text-slate-500">Powered by Google Gemini AI — 完全無料枠対応</p>
      </footer>

    </div>
  );
}
