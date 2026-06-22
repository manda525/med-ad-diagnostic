import { getStripe } from "../../lib/stripe";

const PRICE_BY_PLAN = {
  individual: process.env.STRIPE_PRICE_INDIVIDUAL,
  corporate: process.env.STRIPE_PRICE_CORPORATE,
};

function getBaseUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (host) return `${proto}://${host}`;
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://med-ad-diagnostic.vercel.app").replace(/\/$/, "");
}

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

  try {
    const stripe = getStripe();
    const baseUrl = getBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?checkout=success`,
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
