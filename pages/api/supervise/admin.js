// 運営用：依頼の一覧と、状態の更新。SUPERVISE_ADMIN_TOKEN が未設定なら機能ごと止まる。
//   GET  /api/supervise/admin?status=paid     一覧（status は省略可）
//   POST /api/supervise/admin { id, to, note? }  to = reviewing | delivered | cancelled
// 認証は Authorization: Bearer <トークン>。支払い済みへの変更とStripeの返金は、ここでは行わない。

import { getStore } from "../../../lib/requestStore";
import { getClientIp, hashIp, isSecretConfigured } from "../../../lib/usage";
import {
  adminTransition, checkAdminToken, toAdminView, SuperviseError,
} from "../../../lib/superviseRequest";
import { fail } from "../../../lib/superviseApi";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const auth = checkAdminToken(req.headers.authorization, process.env.SUPERVISE_ADMIN_TOKEN);
    if (auth === "disabled" || !isSecretConfigured()) {
      return res.status(503).json({ error: "disabled" });
    }
    const store = getStore();
    if (!store.available()) throw new SuperviseError("unavailable", "保存先が使えません。", 503);
    if (auth === "denied") {
      // 失敗の回数を数える。総当たりは10分に10回まで
      const ok = await store.hit(`mad:sup:rl:adminfail:${hashIp(getClientIp(req))}`, 10, 600);
      return res.status(ok ? 401 : 429).json({ error: "unauthorized" });
    }

    if (req.method === "GET") {
      const want = typeof req.query.status === "string" ? req.query.status : "";
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const rows = (await store.list(200)).filter((r) => !want || r.status === want).slice(0, limit);
      return res.status(200).json({ requests: rows.map(toAdminView) });
    }

    const { id, to, note } = req.body || {};
    const next = await adminTransition({ store, id, to, note });
    return res.status(200).json(toAdminView(next));
  } catch (e) {
    return fail(res, e);
  }
}
