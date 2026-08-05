// 現在の無料枠の残数を返す（消費しない）。
// 回数の正本はサーバー側にあるため、UIの「残り n/6 回」はここから取る（RFC-001 B-1）。

import { verifyToken } from "../../lib/entitlement";
import { getStripe } from "../../lib/stripe";
import { readUsage, getClientIp, resolveVisitorId, FREE_HARD_LIMIT } from "../../lib/usage";

async function isPro(req) {
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
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ip = getClientIp(req);
  const visitorId = resolveVisitorId(req, res);
  const pro = await isPro(req);
  try {
    const usage = await readUsage({ visitorId, ip });
    return res.status(200).json({ ...usage, pro });
  } catch (e) {
    console.error("usage read failed:", e);
    // 読めない場合は未使用として返す（画面表示のみに使う値なので、実際の可否は診断時に判定される）
    return res.status(200).json({ used: 0, limit: FREE_HARD_LIMIT, remaining: FREE_HARD_LIMIT, pro });
  }
}
