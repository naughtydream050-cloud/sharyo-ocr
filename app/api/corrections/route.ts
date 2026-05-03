import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type CorrectionPayload = {
  field:      string;
  ai_value:   string;
  user_value: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 });
  }

  let corrections: CorrectionPayload[];
  try {
    corrections = await req.json();
    if (!Array.isArray(corrections) || corrections.length === 0) {
      return NextResponse.json({ saved: 0 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rows = corrections
    .filter(c => c.field && c.ai_value !== c.user_value)
    .map(c => ({
      user_id:    user.id,
      field:      String(c.field).slice(0, 64),
      ai_value:   String(c.ai_value).slice(0, 256),
      user_value: String(c.user_value).slice(0, 256),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ saved: 0 });
  }

  const { error } = await supabase.from('corrections_log').insert(rows);
  if (error) {
    console.error('[corrections] insert error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: rows.length });
}
