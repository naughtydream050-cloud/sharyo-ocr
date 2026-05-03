import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// 遅延初期化: ビルド時に STRIPE_SECRET_KEY が未設定でもエラーにならない
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

const CHECKOUT_CREDITS = 30;
const SUBSCRIPTION_CREDITS = 300;

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      // ── 一回払い / サブスク初回決済完了 ─────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string | null;
        const customerEmail = session.customer_details?.email ?? session.customer_email;
        const subscriptionId = session.subscription as string | null;

        // ユーザー特定: customer_id → email の順で検索
        let userId: string | null = null;

        if (customerId) {
          const { data } = await admin
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          userId = data?.id ?? null;
        }

        if (!userId && customerEmail) {
          const { data } = await admin
            .from('profiles')
            .select('id')
            .eq('email', customerEmail)
            .maybeSingle();
          userId = data?.id ?? null;
        }

        if (!userId) {
          console.error('[webhook] user not found for session', session.id);
          break;
        }

        // stripe_customer_id を profiles に保存
        if (customerId) {
          await admin
            .from('profiles')
            .update({ stripe_customer_id: customerId })
            .eq('id', userId);
        }

        if (subscriptionId) {
          // サブスク: plan='pro' + 月次リセット分クレジット付与
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await admin.from('subscriptions').upsert({
            user_id: userId,
            stripe_subscription_id: subscriptionId,
            status: sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'stripe_subscription_id' });

          await admin
            .from('profiles')
            .update({ plan: 'pro', credits: SUBSCRIPTION_CREDITS, last_reset_at: new Date().toISOString() })
            .eq('id', userId);
        } else {
          // 一回払い: クレジット加算
          await admin.rpc('add_credits', { user_id: userId, amount: CHECKOUT_CREDITS });
        }
        break;
      }

      // ── サブスク更新（月次リセット）─────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as { subscription?: string }).subscription ?? null;
        if (!subscriptionId || invoice.billing_reason !== 'subscription_cycle') break;

        const { data: subRow } = await admin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle();

        if (!subRow?.user_id) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await admin.from('subscriptions').update({
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', subscriptionId);

        // 月次クレジットリセット
        await admin
          .from('profiles')
          .update({ credits: SUBSCRIPTION_CREDITS, last_reset_at: new Date().toISOString() })
          .eq('id', subRow.user_id);
        break;
      }

      // ── サブスクキャンセル ────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const { data: subRow } = await admin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();

        if (subRow?.user_id) {
          await admin.from('subscriptions').update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', sub.id);

          await admin
            .from('profiles')
            .update({ plan: 'free' })
            .eq('id', subRow.user_id);
        }
        break;
      }

      default:
        // 未処理イベントは無視
        break;
    }
  } catch (err) {
    console.error('[webhook] handler error:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
