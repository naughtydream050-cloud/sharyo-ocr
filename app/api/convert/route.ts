import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
}

type MonthlyReportRow = {
  date?: string | number | null;
  user?: string | null;
  departure_meter?: string | number | null;
  arrival_meter?: string | number | null;
  note?: string | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  child_check?: string | boolean | null;
};

type MonthlyReportPayload = {
  rows?: MonthlyReportRow[];
};

function isMonthlyReportWorkbook(wb: ExcelJS.Workbook): boolean {
  return Boolean(wb.getWorksheet('ノア'));
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function parseMonthlyReportPayload(input: unknown): MonthlyReportRow[] {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as MonthlyReportPayload).rows
    : undefined;
  if (!Array.isArray(source)) return [];
  return source
    .filter(row => row && typeof row === 'object')
    .slice(0, 80);
}

async function fillNoahMonthlyReport(buf: Uint8Array, rows: MonthlyReportRow[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  const sheet = wb.getWorksheet('ノア');
  if (!sheet) throw new Error('車両月報テンプレートに「ノア」シートが見つかりません');

  rows.forEach((row, index) => {
    const excelRow = 6 + index;
    sheet.getCell(`B${excelRow}`).value = cellText(row.date);
    sheet.getCell(`C${excelRow}`).value = cellText(row.user);
    sheet.getCell(`F${excelRow}`).value = cellText(row.departure_meter);
    sheet.getCell(`I${excelRow}`).value = cellText(row.arrival_meter);
    sheet.getCell(`O${excelRow}`).value = cellText(row.note);
    sheet.getCell(`P${excelRow}`).value = cellText(row.departure_time);
    sheet.getCell(`Q${excelRow}`).value = cellText(row.arrival_time);
    sheet.getCell(`R${excelRow}`).value = typeof row.child_check === 'boolean'
      ? (row.child_check ? '☑' : '')
      : cellText(row.child_check);
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function getExcelFields(buf: Uint8Array): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  const fields = new Set<string>();
  wb.eachSheet(sheet => {
    sheet.eachRow(row => {
      row.eachCell(cell => {
        const v = String(cell.value ?? '');
        const m = v.match(/\{\{(\w+)\}\}/g);
        if (m) m.forEach(tag => fields.add(tag.replace(/\{\{|\}\}/g, '')));
      });
    });
  });
  return [...fields];
}

async function fillExcel(buf: Uint8Array, data: Record<string, string>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  wb.eachSheet(sheet => {
    sheet.eachRow(row => {
      row.eachCell(cell => {
        if ((cell as ExcelJS.Cell & { formula?: string }).formula) return;
        let v = String(cell.value ?? '');
        let changed = false;
        for (const [k, val] of Object.entries(data)) {
          const tag = '{{' + k + '}}';
          if (v.includes(tag)) { v = v.split(tag).join(val); changed = true; }
        }
        if (changed) cell.value = v;
      });
    });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function getWordFields(buf: Uint8Array): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PizZip = require('pizzip');
    const zip = new PizZip(buf);
    const xmlFile = zip.files['word/document.xml'];
    if (!xmlFile) return [];
    const xml = xmlFile.asText() as string;
    const m = xml.match(/\{\{(\w+)\}\}/g);
    return m ? [...new Set<string>(m.map((t: string) => t.replace(/\{\{|\}\}/g, '')))] : [];
  } catch {
    return [];
  }
}

function fillWord(buf: Uint8Array, data: Record<string, string>): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PizZip = require('pizzip');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Docxtemplater = require('docxtemplater');
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Uint8Array;
}

async function detectMonthlyReport(buf: Uint8Array): Promise<boolean> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  return isMonthlyReportWorkbook(wb);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'ログインが必要です。アカウント登録後に変換できます。' },
      { status: 401 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits, plan')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'プロフィール取得に失敗しました' }, { status: 500 });
  }

  if (profile.credits <= 0) {
    return NextResponse.json(
      { error: 'クレジットが不足しています。プランをアップグレードしてください。', credits: 0 },
      { status: 403 }
    );
  }

  try {
    const form = await req.formData();
    const templateFile = form.get('template') as File | null;
    const imageFile    = form.get('image')    as File | null;

    if (!templateFile || !imageFile) {
      return NextResponse.json({ error: 'template と image の両方が必要です' }, { status: 400 });
    }

    const fname   = templateFile.name.toLowerCase();
    const isExcel = fname.endsWith('.xlsx');
    const isWord  = fname.endsWith('.docx');

    if (!isExcel && !isWord) {
      return NextResponse.json(
        { error: 'テンプレートは .xlsx / .docx に対応しています（.xls / .ods は非対応です）' },
        { status: 400 },
      );
    }

    const templateBuf = new Uint8Array(await templateFile.arrayBuffer());
    const imageBuf    = new Uint8Array(await imageFile.arrayBuffer());
    const imageB64    = Buffer.from(imageBuf).toString('base64');
    const mimeType    = (imageFile.type || 'image/jpeg') as string;
    const isMonthlyReport = isExcel ? await detectMonthlyReport(templateBuf) : false;

    const fields = isMonthlyReport
      ? []
      : isExcel
        ? await getExcelFields(templateBuf)
        : getWordFields(templateBuf);

    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
    let extracted: Record<string, unknown> = {};

    if (isDemoMode) {
      if (isMonthlyReport) {
        extracted = { rows: [{ date: '1', user: '山田', departure_meter: '173816', arrival_meter: '173826', note: '送迎', departure_time: '8:10', arrival_time: '9:54', child_check: true }] };
      } else {
        const now = new Date();
        const demoDefaults: Record<string, string> = {
          name:    '山田 太郎（デモ）',
          date:    now.toLocaleDateString('ja-JP'),
          amount:  '12,500',
          address: '東京都渋谷区1-2-3',
          note:    'デモデータです',
          company: '株式会社サンプル',
          phone:   '03-1234-5678',
          total:   '12,500',
        };
        extracted = Object.fromEntries(fields.map(f => [f, demoDefaults[f] ?? '[' + f + 'のデモ値]']));
      }
    } else {
      const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));
      const OCR_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];
      const MAX_RETRIES = 3;

      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) {
        console.error('[OCR] FATAL: GOOGLE_GENERATIVE_AI_API_KEY is not set');
        return NextResponse.json(
          { error: 'サーバー設定エラー: Gemini APIキーが設定されていません' },
          { status: 500 },
        );
      }
      console.log('[OCR] API key present, length:', apiKey.length);

      const prompt = isMonthlyReport
        ? 'あなたは車両月報のOCR専門家です。この画像の表を上から下へ読み取り、JSONオブジェクトのみ返してください。説明文やマークダウンは禁止です。形式は必ず {"rows":[{"date":"1","user":"使用者","departure_meter":"173816","arrival_meter":"173826","note":"送迎","departure_time":"8:10","arrival_time":"9:54","child_check":true}]} です。キーは date, user, departure_meter, arrival_meter, note, departure_time, arrival_time, child_check のみ使用してください。読み取れない値は空文字、残留児確認にチェックがある場合は child_check を true、ない場合は false にしてください。'
        : 'あなたは手書き書類のOCR専門家です。この画像からテキストを正確に抽出してください。\n\n' +
          '【ドメイン知識】\n' +
          '- 手書きの業務書類です。日付、数値、氏名、目的などが含まれる場合があります。\n' +
          '- 読み取りが困難な箇所は推測せず null を使用してください。\n\n' +
          '【対象フィールド】\n' +
          (fields.length > 0
            ? `テンプレートには以下のフィールドがあります: ${fields.join(', ')}。これらに対応する手書き文字を抽出してください。`
            : '手書き書類から読み取れるすべてのキーと値を抽出してください。') +
          '\n\n【出力形式】JSONオブジェクトのみ返してください（マークダウン不要）。\n' +
          '読み取れない場合は値を null にしてください。\n' +
          '例: {"name": "田中太郎", "date": "2024/04/23", "amount": "5000", "note": null}';

      let parseSuccess = false;
      let lastErrorMsg = '';

      for (const modelName of OCR_MODELS) {
        let retryCount = 0;
        while (retryCount <= MAX_RETRIES) {
          try {
            console.log(`[OCR] Trying model: ${modelName} (attempt ${retryCount + 1})`);
            const model = getGenAI().getGenerativeModel({ model: modelName });
            const result = await model.generateContent([
              prompt,
              { inlineData: { mimeType, data: imageB64 } },
            ]);
            const rawText = result.response.text().replace(/```json|```/g, '').trim();
            console.log('[OCR] Raw response (first 200):', rawText.substring(0, 200));
            const jsonStr = rawText.match(/\{[\s\S]*\}/)?.[0] ?? rawText;
            const parsed = JSON.parse(jsonStr);
            extracted = parsed.data ?? parsed;
            if (!isMonthlyReport) {
              for (const key of Object.keys(extracted)) {
                if (extracted[key] === null) extracted[key] = '';
              }
            }
            parseSuccess = true;
            console.log('[OCR] Success with model:', modelName);
            break;
          } catch (error: unknown) {
            const err = error as { status?: number; message?: string; toString?: () => string };
            lastErrorMsg = err?.message ?? String(error);
            console.error(`[OCR] ${modelName} attempt ${retryCount + 1} failed:`, lastErrorMsg);
            const isRateLimit = err?.status === 429 || lastErrorMsg.includes('429') || lastErrorMsg.includes('RESOURCE_EXHAUSTED');
            if (isRateLimit && retryCount < MAX_RETRIES) {
              const waitMs = Math.pow(2, retryCount) * 1000;
              console.warn(`[OCR] Rate limited. Retry in ${waitMs}ms`);
              await sleep(waitMs);
              retryCount++;
              continue;
            }
            break;
          }
        }
        if (parseSuccess) break;
      }

      if (!parseSuccess) {
        console.error('[OCR] All models failed. Last error:', lastErrorMsg);
        return NextResponse.json(
          { error: `OCR処理に失敗しました。[詳細: ${lastErrorMsg.substring(0, 200)}]` },
          { status: 500 },
        );
      }
    }

    await supabase.rpc('decrement_credits', { user_id: user.id });
    await supabase.from('conversions').insert({
      user_id: user.id,
      template_name: templateFile.name,
      file_type: isExcel ? 'xlsx' : 'docx',
      credits_used: 1,
      status: 'success',
    });

    if (isExcel) {
      const filled = isMonthlyReport
        ? await fillNoahMonthlyReport(templateBuf, parseMonthlyReportPayload(extracted))
        : await fillExcel(templateBuf, extracted as Record<string, string>);
      return new NextResponse(filled as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="filled_' + encodeURIComponent(templateFile.name) + '"',
        },
      });
    } else {
      let filled: Uint8Array;
      try {
        filled = fillWord(templateBuf, extracted as Record<string, string>);
      } catch (e) {
        const err = e as { code?: string; message?: string };
        if (err.code === 'MODULE_NOT_FOUND') {
          return NextResponse.json(
            { error: 'Word処理ライブラリ未インストール。install_word.bat を実行してください。' },
            { status: 500 },
          );
        }
        throw e;
      }
      return new NextResponse(filled as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': 'attachment; filename="filled_' + encodeURIComponent(templateFile.name) + '"',
        },
      });
    }
  } catch (err) {
    console.error('[/api/convert]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
