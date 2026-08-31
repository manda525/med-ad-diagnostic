// GA4 への計測。測定IDが未設定なら何もしない（開発時とID発行前に安全に無視される）。
//
// 目的は1つ：広告文を貼った人のうち、何%が相談まで進むかを知ること。
// これが分からないまま「有料プランが売れない」と判断していた（2026-08-31）。

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";

/**
 * @param {string} name  イベント名（GA4のカスタムイベントとして記録される）
 * @param {object} params 付随データ。個人情報・広告文の本文は絶対に渡さない
 */
export function track(name, params = {}) {
  if (typeof window === "undefined") return;
  if (!GA_ID || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, params);
  } catch (_) {
    // 計測の失敗で本体を止めない
  }
}
