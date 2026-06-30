// Anthropic API への中継役（Step 4: サーバー側エンタイトルメント判定つき）
// APIキーは Vercel の環境変数 ANTHROPIC_API_KEY から読み込み

import { verifyToken } from "../../lib/entitlement";
import { getStripe } from "../../lib/stripe";

const FREE_HARD_LIMIT = 6;

async function isProRequest(req) {
  const payload = verifyToken(req.headers["x-entitlement-token"]);
  if (!payload || !payload.s) return false;
  try {
    const sub = await getStripe().subscriptions.retrieve(payload.s);
    return !!sub && (sub.status === "active" || sub.status === "trialing");
  } catch (e) {
    console.error("subscription check failed:", e.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const usage = parseInt(req.headers["x-usage-count"] || "0", 10) || 0;
  const pro = await isProRequest(req);
  res.setHeader("x-pro", pro ? "1" : "0");

  if (!pro && usage >= FREE_HARD_LIMIT) {
    return res.status(402).json({
      error: "無料診断の上限に達しました。プランにご登録ください。",
      requireUpgrade: true,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY が設定されていません。Vercel の Environment Variables を確認してください。",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
