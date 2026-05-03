import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/me — returns { user, credits, plan } or { user: null }
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null, credits: null, plan: null });
  }

  // RLS: profiles_self allows user to read their own row (auth.uid() = id)
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits, plan')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    credits: profile?.credits ?? 0,
    plan: profile?.plan ?? 'free',
  });
}
