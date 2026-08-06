// Stripe 請求ポータルを開く。
// 顧客IDはリクエストボディでなく、署名付きエンタイトルメントトークンから取り出す。
// ボディの customerId をそのまま Stripe に渡すと、顧客IDを入手した第三者が
// 他人の請求ポータル（カード情報・請求履歴・解約）を開けてしまうため。

import { getStripe } from "../../lib/stripe";
import { getBaseUrl } from "../../lib/baseUrl";
import { verifyToken } from "../../lib/entitlement";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const payload = verifyToken(req.headers["x-entitlement-token"]);
  if (!payload || !payload.c) {
    return res.status(401).json({ error: "ご契約の確認ができませんでした。決済後の画面から再度お試しください。" });
  }
  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: payload.c,
      return_url: `${getBaseUrl(req)}/`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("portal error:", e);
    return res.status(500).json({ error: "Could not open billing portal" });
  }
}
