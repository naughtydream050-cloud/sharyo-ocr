/**
 * POST /api/excel/export
 *
 * Body (multipart/form-data):
 *   template_id  : UUID  — DB上のテンプレートID
 *   rows         : JSON  — OCR結果行の配列 [{ field: value, ... }]
 *   overrides    : JSON? — { "B2": "2024年4月" } のようなセル直指定（任意）
 *
 * 返却: xlsx バイナリ (application/vnd.openxmlformats...)
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';

export const runtime  = 'nodejs';
export const maxDuration = 30;

type FieldMapping = {
  field_name: string;
  cell_addr:  string;
  value_type: 'text' | 'number' | 'date';
  col_letter: string | null;
  is_row_field: boolean;
};

type TemplateRecord = {
  id:            string;
  storage_path:  string;
  start_row:     number;
  field_mappings: FieldMapping[];
};

function writeCellValue(
  sheet:     ExcelJS.Worksheet,
  addr:      string,
  raw:       string,
  valueType: FieldMapping['value_type'],
) {
  const cell = sheet.getCell(addr);

  if (cell.formula) {
    console.warn(`[excel/export] Skipped formula cell ${addr}`);
    return;
  }

  switch (valueType) {
    case 'number': {
      const num = parseFloat(raw.replace(/,/g, ''));
      cell.value = isNaN(num) ? raw : num;
      break;
    }
    case 'date': {
      const parsed = Date.parse(raw);
      cell.value   = isNaN(parsed) ? raw : new Date(parsed);
      break;
    }
    default:
      cell.value = raw;
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: '未認証' }, { status: 401 });
    }

    const form        = await req.formData();
    const templateId  = form.get('template_id') as string | null;
    const rowsJson    = form.get('rows')         as string | null;
    const overrideRaw = form.get('overrides')    as string | null;

    if (!templateId) return NextResponse.json({ error: 'template_id が必要です' }, { status: 400 });
    if (!rowsJson)   return NextResponse.json({ error: 'rows が必要です' },        { status: 400 });

    const rows:      Record<string, string>[] = JSON.parse(rowsJson);
    const overrides: Record<string, string>   = overrideRaw ? JSON.parse(overrideRaw) : {};

    const { data: tmpl, error: tmplErr } = await supabase
      .from('templates')
      .select(`
        id,
        storage_path,
        start_row,
        field_mappings (
          field_name,
          cell_addr,
          value_type,
          col_letter,
          is_row_field
        )
      `)
      .eq('id', templateId)
      .eq('user_id', user.id)
      .single();

    if (tmplErr || !tmpl) {
      return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 });
    }

    const template = tmpl as unknown as TemplateRecord;

    const { data: fileData, error: dlErr } = await supabase.storage
      .from('templates')
      .download(template.storage_path);

    if (dlErr || !fileData) {
      return NextResponse.json({ error: 'テンプレートファイルの取得に失敗しました' }, { status: 500 });
    }

    const fileBuffer = new Uint8Array(await fileData.arrayBuffer());

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    const sheet = workbook.worksheets[0];

    for (const [addr, value] of Object.entries(overrides)) {
      writeCellValue(sheet, addr.toUpperCase(), value, 'text');
    }

    const fixedMappings = template.field_mappings.filter(m => !m.is_row_field);
    if (rows.length > 0) {
      for (const m of fixedMappings) {
        const value = rows[0][m.field_name] ?? '';
        if (value !== '') writeCellValue(sheet, m.cell_addr, value, m.value_type);
      }
    }

    const rowMappings = template.field_mappings.filter(m => m.is_row_field && m.col_letter);
    const startRow    = template.start_row ?? 5;

    rows.forEach((row, idx) => {
      const excelRowNum = startRow + idx;
      for (const m of rowMappings) {
        const addr  = `${m.col_letter!.toUpperCase()}${excelRowNum}`;
        const value = row[m.field_name] ?? '';
        writeCellValue(sheet, addr, value, m.value_type);
      }
    });

    const outBuffer = await workbook.xlsx.writeBuffer();
    const filename  = `output_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(Buffer.from(outBuffer), {
      status:  200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[excel/export]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
