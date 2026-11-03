// 監修の依頼を作り、Stripe の支払い画面のURLを返す。
// 金額は文字数からサーバーで計算する（クライアントの金額は読まない）。

import { getStripe } from "../../../lib/stripe";
import { getBaseUrl } from "../../../lib/baseUrl";
import { getStore } from "../../../lib/requestStore";
import { createRequest, isLiveKeyOutsideProduction } from "../../../lib/superviseRequest";
import { fail, withinLimit, tooMany } from "../../../lib/superviseApi";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // 本番以外のデプロイでは、本番(live)の鍵で決済を作らない（/api/checkout と同じ誤課金防止）
  if (isLiveKeyOutsideProduction()) {
    return res.status(403).json({ error: "プレビュー環境では本番決済を無効化しています（誤課金防止）。", code: "preview_blocked" });
  }
  try {
    const store = getStore();
    if (!(await withinLimit(req, store, "create", 8, 3600))) throw tooMany();
    const out = await createRequest({ store, stripe: getStripe(), body: req.body, baseUrl: getBaseUrl(req) });
    return res.status(200).json(out);
  } catch (e) {
    return fail(res, e);
  }
}
