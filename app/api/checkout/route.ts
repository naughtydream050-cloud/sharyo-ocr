import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId   = process.env.STRIPE_PRICE_ID;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // ── キー未設定チェック ─────────────────────────────────────────────
  if (!secretKey || secretKey.startsWith('your-') ||
      !priceId   || priceId.startsWith('your-')) {
    return NextResponse.json(
      { error: 'Stripeのキーを設定してください（.env.local の STRIPE_SECRET_KEY と STRIPE_PRICE_ID）' },
      { status: 400 },
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require('stripe');
    const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?checkout=success`,
      cancel_url:  `${appUrl}/#tool`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[/api/checkout]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
