// お支払い待ちの依頼で、支払い画面を開き直す。

import { getStripe } from "../../../lib/stripe";
import { getBaseUrl } from "../../../lib/baseUrl";
import { getStore } from "../../../lib/requestStore";
import { resumeCheckout, isLiveKeyOutsideProduction } from "../../../lib/superviseRequest";
import { fail, withinLimit, tooMany } from "../../../lib/superviseApi";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (isLiveKeyOutsideProduction()) {
    return res.status(403).json({ error: "プレビュー環境では本番決済を無効化しています（誤課金防止）。", code: "preview_blocked" });
  }
  try {
    const store = getStore();
    if (!(await withinLimit(req, store, "resume", 20, 3600))) throw tooMany();
    const { id } = req.body || {};
    const out = await resumeCheckout({ store, stripe: getStripe(), id, baseUrl: getBaseUrl(req) });
    return res.status(200).json(out);
  } catch (e) {
    return fail(res, e);
  }
}
