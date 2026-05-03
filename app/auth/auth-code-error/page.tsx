'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthCodeErrorPage() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.push('/'), 5000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center border border-red-100">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-extrabold text-slate-800 mb-2">ログインに失敗しました</h1>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
          Googleアカウントの認証中にエラーが発生しました。<br />
          しばらくしてから再度お試しください。
        </p>
        <button
          onClick={() => router.push('/')}
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-full transition-colors text-sm"
        >
          トップに戻る
        </button>
        <p className="text-xs text-slate-400 mt-4">5秒後に自動的に戻ります</p>
      </div>
    </div>
  );
}
