import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Load .env.local manually if STRIPE_SECRET_KEY is not already in process.env
// ---------------------------------------------------------------------------
function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Idempotent helpers
// ---------------------------------------------------------------------------

async function findOrCreateProduct(stripe, name, planKey) {
  // Search existing products by metadata.plan_key
  const existing = await stripe.products.list({ limit: 100 });
  for (const product of existing.data) {
    if (product.metadata?.plan_key === planKey) {
      console.log(`  Found existing product: ${product.id} (${product.name})`);
      return product;
    }
  }

  const product = await stripe.products.create({
    name,
    metadata: { plan_key: planKey },
  });
  console.log(`  Created product: ${product.id} (${product.name})`);
  return product;
}

async function findOrCreatePrice(stripe, productId, unitAmount, currency, interval) {
  // Search existing active prices for this product
  const existing = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });
  for (const price of existing.data) {
    if (
      price.unit_amount === unitAmount &&
      price.currency === currency &&
      price.recurring?.interval === interval
    ) {
      console.log(`  Found existing price: ${price.id} (${currency.toUpperCase()} ${unitAmount}/${interval})`);
      return price;
    }
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency,
    recurring: { interval },
  });
  console.log(`  Created price: ${price.id} (${currency.toUpperCase()} ${unitAmount}/${interval})`);
  return price;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Load .env.local if needed
  if (!process.env.STRIPE_SECRET_KEY) {
    loadDotEnvLocal();
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    console.error('ERROR: STRIPE_SECRET_KEY is not set.');
    console.error('Copy .env.local.example to .env.local and fill in your Stripe test key.');
    process.exit(1);
  }

  if (!secretKey.startsWith('sk_test_')) {
    console.error('ERROR: STRIPE_SECRET_KEY does not start with sk_test_');
    console.error('This script refuses to run against live (non-test) Stripe keys.');
    process.exit(1);
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' });

  console.log('=== Setting up Stripe products (test mode) ===\n');

  // Individual plan: 個人プラン — ¥500/month
  console.log('[1/2] 個人プラン (Individual)');
  const individualProduct = await findOrCreateProduct(stripe, '個人プラン', 'individual');
  const individualPrice = await findOrCreatePrice(stripe, individualProduct.id, 500, 'jpy', 'month');

  // Corporate plan: 法人プラン — ¥5,000/month
  console.log('\n[2/2] 法人プラン (Corporate)');
  const corporateProduct = await findOrCreateProduct(stripe, '法人プラン', 'corporate');
  const corporatePrice = await findOrCreatePrice(stripe, corporateProduct.id, 5000, 'jpy', 'month');

  // Output copy-paste block
  console.log('\n=== Copy these into your .env.local ===\n');
  console.log(`STRIPE_PRICE_INDIVIDUAL=${individualPrice.id}`);
  console.log(`STRIPE_PRICE_CORPORATE=${corporatePrice.id}`);
  console.log('\n=======================================');
}

main().catch((err) => {
  console.error('Unexpected error:', err.message ?? err);
  process.exit(1);
});
