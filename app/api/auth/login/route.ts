import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { baseUrl } from '@/lib/base-url';

export const dynamic = 'force-dynamic';

// POST /api/auth/login — redirect to Google OAuth
export async function POST() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${baseUrl()}/auth/callback`,
    },
  });

  if (error || !data.url) {
    return NextResponse.json({ error: error?.message ?? 'OAuth error' }, { status: 500 });
  }

  return NextResponse.json({ url: data.url });
}
