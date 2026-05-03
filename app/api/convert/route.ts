import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
}

async function getExcelFields(buf: Uint8Array): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  const fields = new Set<string>();
  wb.eachSheet(sheet => {
    sheet.eachRow(row => {
      row.eachCell(cell => {
        const v = String(cell.value ?? '');
        const m = v.match(/\{\{([\w\-一-龥ぁ-んァ-ヶー]+)\}\}/g);
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
    const text = xml.replace(/<[^>]+>/g, '');
    const m = text.match(/\{\{([\w\-一-龥ぁ-んァ-ヶー]+)\}\}/g);
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

function normalizeExtracted(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([key, value]) => [
      key,
      value === null || value === undefined ? '' : String(value),
    ]),
  );
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
    console.error('[convert] profile fetch failed:', profileError?.message);
    return NextResponse.json({ error: 'プロフィール取得に失敗しました' }, { status: 500 });
  }

  if (profile.plan !== 'pro' && profile.credits <= 0) {
    return NextResponse.json(
      { error: 'クレジットが不足しています。プランをアップグレードしてください。', credits: 0 },
      { status: 403 }
    );
  }

  try {
    const form = await req.formData();
    const templateFile = form.get('template') as File | null;
    const imageFile = form.get('image') as File | null;

    if (!templateFile || !imageFile) {
      return NextResponse.json({ error: 'template と image の両方が必要です' }, { status: 400 });
    }

    const fname = templateFile.name.toLowerCase();
    const isExcel = fname.endsWith('.xlsx');
    const isWord = fname.endsWith('.docx');

    if (!isExcel && !isWord) {
      return NextResponse.json(
        { error: 'テンプレートは .xlsx / .docx のみ対応しています（.xls は非対応です）' },
        { status: 400 },
      );
    }

    const templateBuf = new Uint8Array(await templateFile.arrayBuffer());
    const imageBuf = new Uint8Array(await imageFile.arrayBuffer());
    const imageB64 = Buffer.from(imageBuf).toString('base64');
    const mimeType = imageFile.type || 'image/jpeg';

    const fields = isExcel ? await getExcelFields(templateBuf) : getWordFields(templateBuf);

    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
    let extracted: Record<string, string> = {};

    if (isDemoMode) {
      const now = new Date();
      const demoDefaults: Record<string, string> = {
        name: '山田 太郎（デモ）',
        date: now.toLocaleDateString('ja-JP'),
        amount: '12,500',
        address: '東京都渋谷区1-2-3',
        note: 'デモデータです',
        company: '株式会社サンプル',
        phone: '03-1234-5678',
        total: '12,500',
      };
      extracted = Object.fromEntries(fields.map(f => [f, demoDefaults[f] ?? '[' + f + 'のデモ値]']));
    } else {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) {
        console.error('[OCR] FATAL: GOOGLE_GENERATIVE_AI_API_KEY is not set');
        return NextResponse.json(
          { error: 'サーバー設定エラー: Gemini APIキーが設定されていません' },
          { status: 500 },
        );
      }

      const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));
      const OCR_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];
      const MAX_RETRIES = 3;
      const fieldHint = fields.length > 0
        ? `テンプレートには以下のフィールドがあります: ${fields.join(', ')}。必ずこのキー名でJSONを返してください。`
        : '手書き書類から読み取れるキーと値をJSONで抽出してください。';

      const prompt =
        'あなたは手書き書類のOCR専門家です。この画像からテキストを正確に抽出してください。\n\n' +
        '【対象フィールド】\n' + fieldHint + '\n\n' +
        '【厳守】JSONオブジェクトのみ返してください。マークダウン、説明文、コードフェンスは禁止です。\n' +
        '読み取れない値は null にしてください。\n' +
        '例: {"name":"田中太郎","date":"2024/04/23","amount":"5000","note":null}';

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
            const parsed = JSON.parse(jsonStr) as unknown;
            extracted = normalizeExtracted((parsed as { data?: unknown }).data ?? parsed);
            parseSuccess = true;
            console.log('[OCR] Success with model:', modelName);
            break;
          } catch (error: unknown) {
            const err = error as { status?: number; message?: string };
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
          { error: `OCR処理に失敗しました。時間を置いて再実行してください。[詳細: ${lastErrorMsg.substring(0, 200)}]` },
          { status: 500 },
        );
      }
    }

    let filled: Uint8Array;
    let contentType: string;
    if (isExcel) {
      filled = await fillExcel(templateBuf, extracted);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      filled = fillWord(templateBuf, extracted);
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    const { error: creditError } = await supabase.rpc('decrement_credits', { user_id: user.id });
    if (creditError) console.error('[convert] decrement_credits failed:', creditError.message);

    const { error: conversionError } = await supabase.from('conversions').insert({
      user_id: user.id,
      template_name: templateFile.name,
      file_type: isExcel ? 'xlsx' : 'docx',
      credits_used: 1,
      status: 'success',
    });
    if (conversionError) console.error('[convert] conversions insert failed:', conversionError.message);

    return new NextResponse(filled as unknown as BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'attachment; filename="filled_' + encodeURIComponent(templateFile.name) + '"',
      },
    });
  } catch (err) {
    console.error('[/api/convert]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
