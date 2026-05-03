import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { baseUrl } from '@/lib/base-url';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const oauthError = searchParams.get('error');
  const oauthErrorCode = searchParams.get('error_code');
  const oauthErrorDescription = searchParams.get('error_description');
  const appBaseUrl = baseUrl();

  if (oauthError) {
    console.error('[auth/callback] OAuth provider returned error:', {
      error: oauthError,
      error_code: oauthErrorCode,
      error_description: oauthErrorDescription,
    });
    const redirectUrl = new URL('/auth/auth-code-error', appBaseUrl);
    redirectUrl.searchParams.set('reason', oauthErrorCode ?? oauthError);
    if (oauthErrorDescription) redirectUrl.searchParams.set('description', oauthErrorDescription.slice(0, 300));
    return NextResponse.redirect(redirectUrl);
  }

  if (!code) {
    console.error('[auth/callback] Missing OAuth code');
    const redirectUrl = new URL('/auth/auth-code-error', appBaseUrl);
    redirectUrl.searchParams.set('reason', 'missing_code');
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed:', {
      message: error.message,
      name: error.name,
      status: error.status,
    });
    const redirectUrl = new URL('/auth/auth-code-error', appBaseUrl);
    redirectUrl.searchParams.set('reason', 'exchange_failed');
    redirectUrl.searchParams.set('message', error.message.slice(0, 300));
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(new URL(next, appBaseUrl));
}
