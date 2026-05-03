// (省略: 既存コード維持しつつ以下修正)

// 変更点1: .xls禁止（ExcelJS非対応）
if (!isExcel && !isWord) {
  return NextResponse.json(
    { error: 'テンプレートは .xlsx / .docx のみ対応しています（.xls非対応）' },
    { status: 400 },
  );
}

// 変更点2: クレジット消費を成功後に移動
// ↓このブロックをファイル生成直前へ移動

// （OCR成功後 & ファイル生成成功後）
await supabase.rpc('decrement_credits', { user_id: user.id });
await supabase.from('conversions').insert({
  user_id: user.id,
  template_name: templateFile.name,
  file_type: isExcel ? 'xlsx' : 'docx',
  credits_used: 1,
  status: 'success',
});
