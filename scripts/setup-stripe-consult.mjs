// 薬剤師相談（単発・都度払い）の Stripe 商品と価格を作る。
//
//   node scripts/setup-stripe-consult.mjs            # 既定 1,980円
//   CONSULT_AMOUNT=2980 node scripts/setup-stripe-consult.mjs
//
// テストキー(sk_test_)でのみ動く。本番はダッシュボードで同じ商品を作り、
// STRIPE_PRICE_CONSULT に価格IDを設定する。冪等（同名・同額があれば再利用）。
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim();
  }
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) loadDotEnvLocal();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { console.error('ERROR: STRIPE_SECRET_KEY is not set.'); process.exit(1); }
  if (!key.startsWith('sk_test_')) { console.error('ERROR: refuses to run against non-test keys.'); process.exit(1); }
  const amount = Number(process.env.CONSULT_AMOUNT || 1980);
  const stripe = new Stripe(key, { apiVersion: '2024-04-10' });

  const products = await stripe.products.list({ limit: 100 });
  let product = products.data.find((p) => p.metadata?.plan_key === 'consult');
  if (!product) {
    product = await stripe.products.create({
      name: '薬剤師相談（家族の薬と医療費・単発）',
      description: '3営業日以内にメールで文章回答。診断・治療の判断は行いません。',
      metadata: { plan_key: 'consult' },
    });
    console.log(`Created product ${product.id}`);
  } else {
    console.log(`Found product ${product.id}`);
  }
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find((p) => p.unit_amount === amount && p.currency === 'jpy' && !p.recurring);
  if (!price) {
    price = await stripe.prices.create({ product: product.id, unit_amount: amount, currency: 'jpy' });
    console.log(`Created price ${price.id} (JPY ${amount}, one-time)`);
  } else {
    console.log(`Found price ${price.id}`);
  }
  console.log('\n=== Copy into .env.local / Vercel ===\n');
  console.log(`STRIPE_PRICE_CONSULT=${price.id}`);
}

main().catch((e) => { console.error('Unexpected error:', e.message ?? e); process.exit(1); });
