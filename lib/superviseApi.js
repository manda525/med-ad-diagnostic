// 監修依頼のAPIルートで共通に使う小さな部品。

import { getClientIp, hashIp, isSecretConfigured } from "./usage";
import { SuperviseError } from "./superviseRequest";

// 例外をレスポンスにする。想定した失敗（SuperviseError）は文面をそのまま返し、
// 想定外の失敗は詳細を返さずログにだけ残す。
export function fail(res, e) {
  if (e instanceof SuperviseError) {
    return res.status(e.httpStatus).json({ error: e.message, code: e.code });
  }
  console.error("supervise api error:", e);
  return res.status(500).json({ error: "処理に失敗しました。時間をおいてお試しください。", code: "error" });
}

// IPごとの回数制限。上限を超えたら false。
// APP_TOKEN_SECRET が無いとIPを安全に変換できないので、その場合は受け付けない（D-003 と同じ考え方）。
export async function withinLimit(req, store, name, limit, ttlSec) {
  if (!store || !store.available() || !isSecretConfigured()) {
    throw new SuperviseError("unavailable", "ただいまオンラインでの受付ができません。メールでお申し込みください。", 503);
  }
  return store.hit(`mad:sup:rl:${name}:${hashIp(getClientIp(req))}`, limit, ttlSec);
}

export function tooMany() {
  return new SuperviseError("rate_limited", "短時間にアクセスが集中しています。しばらくしてからお試しください。", 429);
}
