/**
 * Returns the canonical base URL of the app.
 * Priority:
 *  1. NEXT_PUBLIC_APP_URL  — set this explicitly in .env.local / Vercel env
 *  2. VERCEL_URL           — injected automatically by Vercel (no protocol)
 *  3. localhost fallback   — for local dev when neither env var is set
 */
export function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}
