'use client';

/**
 * OcrFillPreview
 * OCR結果の確認・編集テーブル + ExcelテンプレートへのExport UI
 */

import { useState, useCallback } from 'react';

type Row     = Record<string, string>;
type CellKey = `${number}-${string}`;

export type OcrFillPreviewProps = {
  templateId:   string;
  fields:       string[];
  initialRows:  Row[];
  overrides?:   Record<string, string>;
  onSaved?:     (corrections: Correction[]) => void;
};

export type Correction = {
  rowIdx:     number;
  field:      string;
  aiValue:    string;
  userValue:  string;
};

export default function OcrFillPreview({
  templateId,
  fields,
  initialRows,
  overrides = {},
  onSaved,
}: OcrFillPreviewProps) {

  const [rows,     setRows]     = useState<Row[]>(() => initialRows.map(r => ({ ...r })));
  const [original]              = useState<Row[]>(() => initialRows.map(r => ({ ...r })));
  const [modified, setModified] = useState<Set<CellKey>>(new Set());
  const [busy,     setBusy]     = useState(false);
  const [status,   setStatus]   = useState<'idle' | 'done' | 'error'>('idle');
  const [errMsg,   setErrMsg]   = useState('');

  const updateCell = useCallback((rowIdx: number, field: string, value: string) => {
    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [field]: value } : r));
    const key: CellKey = `${rowIdx}-${field}`;
    const orig = original[rowIdx]?.[field] ?? '';
    setModified(prev => {
      const next = new Set(prev);
      value !== orig ? next.add(key) : next.delete(key);
      return next;
    });
  }, [original]);

  const addRow = () =>
    setRows(prev => [...prev, Object.fromEntries(fields.map(f => [f, '']))]);

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setModified(prev => {
      const next = new Set(prev);
      fields.forEach(f => next.delete(`${idx}-${f}` as CellKey));
      return next;
    });
  };

  const buildCorrections = (): Correction[] => {
    const list: Correction[] = [];
    rows.forEach((row, ri) => {
      fields.forEach(field => {
        const ai   = original[ri]?.[field] ?? '';
        const user = row[field] ?? '';
        if (ai !== user) list.push({ rowIdx: ri + 1, field, aiValue: ai, userValue: user });
      });
    });
    return list;
  };

  const handleExport = async () => {
    setBusy(true);
    setStatus('idle');
    setErrMsg('');

    const corrections = buildCorrections();
    if (corrections.length > 0) {
      const payload = corrections.map(c => ({
        field:      c.field,
        ai_value:   c.aiValue,
        user_value: c.userValue,
      }));
      fetch('/api/corrections', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      }).catch(e => console.warn('[corrections] save failed:', e));
    }

    try {
      const fd = new FormData();
      fd.append('template_id', templateId);
      fd.append('rows',        JSON.stringify(rows));
      if (Object.keys(overrides).length > 0) {
        fd.append('overrides', JSON.stringify(overrides));
      }

      const res = await fetch('/api/excel/export', { method: 'POST', body: fd });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = `output_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      setStatus('done');
      onSaved?.(corrections);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    } finally {
      setBusy(false);
    }
  };

  const corrCount = modified.size;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          セルをクリックして編集できます。
          <span className="text-amber-400 ml-1">黄色</span>は修正済みのセルです。
        </p>
        {corrCount > 0 && (
          <span className="text-xs bg-amber-800 text-amber-100 rounded-full px-2 py-0.5">
            {corrCount} 箇所修正済み
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded border border-gray-700">
        <table className="w-full text-xs">
          <thead className="bg-gray-800 sticky top-0">
            <tr>
              <th className="px-2 py-2 text-center text-gray-500 font-normal border-b border-gray-700 w-8">#</th>
              {fields.map(f => (
                <th key={f} className="px-2 py-2 text-left font-medium text-gray-300 border-b border-gray-700 whitespace-nowrap">
                  {f}
                </th>
              ))}
              <th className="px-2 py-2 border-b border-gray-700 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-gray-800 hover:bg-gray-800/30">
                <td className="px-2 py-1 text-center text-gray-600 select-none">{ri + 1}</td>
                {fields.map(field => {
                  const key        = `${ri}-${field}` as CellKey;
                  const isModified = modified.has(key);
                  const origVal    = original[ri]?.[field] ?? '';
                  return (
                    <td key={field} className="px-1 py-1">
                      <input
                        value={row[field] ?? ''}
                        onChange={e => updateCell(ri, field, e.target.value)}
                        title={isModified ? `AI読み取り値: "${origVal}"` : undefined}
                        className={[
                          'w-full min-w-[80px] rounded px-1.5 py-0.5 text-xs outline-none border transition-colors',
                          isModified
                            ? 'bg-amber-900/40 border-amber-600 text-amber-100 hover:border-amber-400 focus:border-amber-300 focus:bg-amber-900/60'
                            : 'bg-transparent border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-800',
                        ].join(' ')}
                      />
                    </td>
                  );
                })}
                <td className="px-1 py-1 text-center">
                  <button onClick={() => removeRow(ri)} title="この行を削除" className="text-red-700 hover:text-red-400 leading-none">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={addRow} className="text-xs text-blue-400 hover:text-blue-300">
        + 行を追加
      </button>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleExport}
          disabled={busy || rows.length === 0}
          className={[
            'px-5 py-2.5 rounded text-sm font-medium transition-colors',
            busy || rows.length === 0
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-green-700 hover:bg-green-600 text-white',
          ].join(' ')}
        >
          {busy ? '⏳ 生成中...' : '📥 Excelに書き込んでダウンロード'}
        </button>
        {corrCount > 0 && !busy && (
          <span className="text-xs text-gray-500">※ {corrCount} 件の修正を学習データとして保存します</span>
        )}
      </div>

      {status === 'done' && (
        <div className="bg-green-950 border border-green-700 rounded px-4 py-3 text-sm text-green-300">
          ✅ ダウンロードが開始されました。
          {corrCount > 0 && <span className="text-green-400 text-xs ml-2">（{corrCount} 件の修正を保存しました）</span>}
        </div>
      )}
      {status === 'error' && (
        <div className="bg-red-950 border border-red-700 rounded px-4 py-3 text-sm text-red-300">
          <strong>エラー:</strong> {errMsg}
        </div>
      )}
    </div>
  );
}
