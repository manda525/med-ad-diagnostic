// 依頼IDで状態を返す。IDを知っている人にだけ見える（推測できない形式）。
// お支払い待ちの依頼は、Stripe に問い合わせて支払い済みなら受付済みに進める。

import { getStripe } from "../../../lib/stripe";
import { getStore } from "../../../lib/requestStore";
import {
  normalizeId, reconcilePayment, toPublicView, SuperviseError,
} from "../../../lib/superviseRequest";
import { fail, withinLimit, tooMany } from "../../../lib/superviseApi";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const store = getStore();
    if (!store.available()) {
      throw new SuperviseError("unavailable", "ただいま状態を確認できません。しばらくしてからお試しください。", 503);
    }
    if (!(await withinLimit(req, store, "status", 90, 600))) throw tooMany();
    const id = normalizeId(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id);
    let record = id ? await store.get(id) : null;
    if (!record) throw new SuperviseError("not_found", "依頼が見つかりません。依頼IDをご確認ください。", 404);
    if (record.status === "awaiting_payment") {
      let stripe = null;
      try { stripe = getStripe(); } catch { /* 鍵が無ければ照会しない */ }
      if (stripe) record = await reconcilePayment({ store, stripe, record });
    }
    return res.status(200).json(toPublicView(record));
  } catch (e) {
    return fail(res, e);
  }
}
