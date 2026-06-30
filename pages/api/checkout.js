import { getStripe } from "../../lib/stripe";
import { getBaseUrl } from "../../lib/baseUrl";

const PRICE_BY_PLAN = {
  individual: process.env.STRIPE_PRICE_INDIVIDUAL,
  corporate: process.env.STRIPE_PRICE_CORPORATE,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { plan } = req.body || {};
  const priceId = PRICE_BY_PLAN[plan];
  if (!priceId) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  // 安全ガード：本番(production)以外のデプロイ（プレビュー等）では live 鍵での本番決済をブロック（誤課金防止）。
  // その環境にテストモードの鍵(sk_test_)を設定すれば、テスト決済は通常どおり動作する。
  const sk = process.env.STRIPE_SECRET_KEY || "";
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" && sk.startsWith("sk_live")) {
    return res.status(403).json({
      error: "プレビュー環境では本番決済を無効化しています（誤課金防止）。",
    });
  }

  try {
    const stripe = getStripe();
    const baseUrl = getBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?checkout=cancel`,
      allow_promotion_codes: true,
      locale: "ja",
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("checkout error:", e);
    return res.status(500).json({ error: "Checkout session creation failed" });
  }
}
