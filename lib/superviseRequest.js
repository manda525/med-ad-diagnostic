// 監修の依頼：作成・決済・状態遷移のロジック。
//
// 入出力（保存先 store と Stripe）は引数で受ける。テストでは偽物を渡す。
// 金額はサーバーが文字数から計算する。クライアントが送ってきた金額は読まない。
//
// 状態は一方向にしか進まない：
//   お支払い待ち → 受付済み → 確認中 → 納品済み　（どの段階からでも「取消」へ）
// 「受付済み」にできるのは支払いの確認だけ。管理側の操作では作れない。

import crypto from "crypto";
import {
  STATUS, STATUS_LABEL, canTransition, MAX_LENGTH, TAX_RATE_PERCENT, yen, feeBreakdown,
} from "./supervise";

export { STATUS, STATUS_LABEL, canTransition, isTerminal, MAX_LENGTH, TAX_RATE_PERCENT, yen, feeBreakdown } from "./supervise";

// 管理側の操作で行ける先。paid は支払いの確認でだけ付く。
const ADMIN_TARGETS = new Set([STATUS.REVIEWING, STATUS.DELIVERED, STATUS.CANCELLED]);

export class SuperviseError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ---- 依頼ID -----------------------------------------------------------------

// 紛らわしい I / L / O / 0 / 1 を除いた31字。12字で約59ビット。
const ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ID_PATTERN = /^SV-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

export function newRequestId() {
  const pick = () => ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)];
  const group = () => Array.from({ length: 4 }, pick).join("");
  return `SV-${group()}-${group()}-${group()}`;
}

// 入力のゆれ（小文字・前後の空白）を直し、形式が合うものだけ返す。合わなければ null。
export function normalizeId(raw) {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toUpperCase();
  return ID_PATTERN.test(id) ? id : null;
}

// ---- 入力 -------------------------------------------------------------------

function cleanText(v, max) {
  if (typeof v !== "string") return "";
  // 制御文字を落として前後を詰め、上限で切る
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

// 作成リクエストの検証。金額は受け取らない。返すのは検証済みの値だけ。
export function parseCreateInput(body) {
  const b = body && typeof body === "object" ? body : {};
  const length = b.length;
  if (!Number.isInteger(length) || length < 1) {
    throw new SuperviseError("bad_length", "原稿の文字数が正しくありません。", 400);
  }
  if (length > MAX_LENGTH) {
    throw new SuperviseError(
      "too_long",
      `${yen(MAX_LENGTH)}文字を超える原稿は、メールでご相談ください。`,
      400
    );
  }
  const judgment = cleanText(b.judgment, 20);
  if (!judgment) {
    throw new SuperviseError("bad_input", "診断結果が確認できません。診断をやり直してください。", 400);
  }
  const risk = Number(b.riskScore);
  return {
    length,
    industryLabel: cleanText(b.industryLabel, 40),
    subLabel: cleanText(b.subLabel, 40),
    mediaLabel: cleanText(b.mediaLabel, 40),
    judgment,
    riskScore: Number.isFinite(risk) ? Math.max(0, Math.min(100, Math.round(risk))) : null,
  };
}

// ---- 公開用の見え方 ---------------------------------------------------------

// 依頼IDを知っている人に返す内容。Stripeのセッション情報と管理メモは含めない。
export function toPublicView(record) {
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    length: record.length,
    fee: record.fee,
    tax: record.tax,
    total: record.total,
    industryLabel: record.industryLabel,
    subLabel: record.subLabel,
    mediaLabel: record.mediaLabel,
    judgment: record.judgment,
    riskScore: record.riskScore,
    history: (record.history || []).map((h) => ({ status: h.status, at: h.at })),
  };
}

// ---- Stripe Checkout --------------------------------------------------------

// プレビュー等の本番以外で、本番(live)の鍵では決済を作らない（誤課金防止）。
// /api/checkout と同じ考え方。
export function isLiveKeyOutsideProduction(env = process.env) {
  const sk = env.STRIPE_SECRET_KEY || "";
  return !!env.VERCEL_ENV && env.VERCEL_ENV !== "production" && sk.startsWith("sk_live");
}

export function checkoutParams(record, baseUrl) {
  const meta = { kind: "supervise", requestId: record.id };
  return {
    mode: "payment",
    locale: "ja",
    client_reference_id: record.id,
    customer_creation: "always",
    metadata: meta,
    payment_intent_data: { description: `広告表現の監修 ${record.id}`, metadata: meta },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "jpy",
          unit_amount: record.fee,
          product_data: {
            name: "広告表現の監修",
            description: `${yen(record.length)}文字（3円/文字・最低1万円）／依頼ID ${record.id}`,
          },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: "jpy",
          unit_amount: record.tax,
          product_data: { name: `消費税（${TAX_RATE_PERCENT}%）` },
        },
      },
    ],
    success_url: `${baseUrl}/supervise?id=${record.id}&from=checkout`,
    cancel_url: `${baseUrl}/supervise?id=${record.id}`,
  };
}

async function openCheckout({ store, stripe, record, baseUrl }) {
  const session = await stripe.checkout.sessions.create(checkoutParams(record, baseUrl));
  try {
    await store.update(record.id, (r) => ({ ...r, sessionId: session.id }));
  } catch (e) {
    // 支払いの反映は、Stripe からの通知と状況確認（メタデータの依頼ID）でも行える
    console.error("supervise session id not saved:", e.message);
  }
  return session;
}

// 支払い済みのセッションが、この依頼のものか確かめる（IDと金額と通貨）。
export function isPaidSessionFor(session, record) {
  return (
    !!session &&
    session.payment_status === "paid" &&
    !!session.metadata &&
    session.metadata.kind === "supervise" &&
    session.metadata.requestId === record.id &&
    session.amount_total === record.total &&
    session.currency === "jpy"
  );
}

// ---- 作成 -------------------------------------------------------------------

function requireStore(store) {
  if (!store || !store.available()) {
    throw new SuperviseError(
      "unavailable",
      "ただいまオンラインでの受付ができません。メールでお申し込みください。",
      503
    );
  }
}

export async function createRequest({ store, stripe, body, baseUrl, now = Date.now() }) {
  const input = parseCreateInput(body);
  requireStore(store);

  const { fee, tax, total } = feeBreakdown(input.length);
  const at = new Date(now).toISOString();
  let record = null;
  for (let i = 0; i < 3 && !record; i++) {
    const candidate = {
      v: 1,
      id: newRequestId(),
      status: STATUS.AWAITING_PAYMENT,
      createdAt: at,
      updatedAt: at,
      ...input,
      fee,
      tax,
      total,
      sessionId: null,
      history: [{ status: STATUS.AWAITING_PAYMENT, at }],
    };
    if (await store.create(candidate)) record = candidate;
  }
  if (!record) throw new SuperviseError("id_collision", "依頼を作成できませんでした。もう一度お試しください。", 500);

  let session;
  try {
    session = await openCheckout({ store, stripe, record, baseUrl });
  } catch (e) {
    console.error("supervise checkout creation failed:", e);
    // 支払いに進めなかった依頼は残さない
    try { await store.remove(record.id); } catch { /* 期限で消える */ }
    throw new SuperviseError("payment_unavailable", "お支払いの画面を開けませんでした。時間をおいてお試しください。", 502);
  }
  return { id: record.id, url: session.url };
}

// お支払い待ちの依頼で、支払い画面を開き直す。
export async function resumeCheckout({ store, stripe, id, baseUrl }) {
  requireStore(store);
  const normalized = normalizeId(id);
  const found = normalized ? await store.get(normalized) : null;
  if (!found) throw new SuperviseError("not_found", "依頼が見つかりません。", 404);

  const record = await reconcilePayment({ store, stripe, record: found });
  if (record.status !== STATUS.AWAITING_PAYMENT) return { paid: record.status !== STATUS.CANCELLED, status: record.status };

  let session;
  try {
    session = await openCheckout({ store, stripe, record, baseUrl });
  } catch (e) {
    console.error("supervise checkout re-creation failed:", e);
    throw new SuperviseError("payment_unavailable", "お支払いの画面を開けませんでした。時間をおいてお試しください。", 502);
  }
  return { url: session.url };
}

// ---- 支払いの反映 -----------------------------------------------------------

// 何度呼んでも結果は同じ（お支払い待ちのときだけ受付済みにする）。
export async function markPaid({ store, id, sessionId }) {
  return store.update(id, (r) => {
    if (r.status !== STATUS.AWAITING_PAYMENT) return r;
    const at = new Date().toISOString();
    return {
      ...r,
      status: STATUS.PAID,
      updatedAt: at,
      sessionId: sessionId || r.sessionId,
      history: [...(r.history || []), { status: STATUS.PAID, at }],
    };
  });
}

// お支払い待ちの依頼について、Stripe に支払い済みか問い合わせて反映する。
// 画面に戻る前にタブを閉じた人や、通知の遅れを拾うため。
export async function reconcilePayment({ store, stripe, record }) {
  if (record.status !== STATUS.AWAITING_PAYMENT || !record.sessionId) return record;
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(record.sessionId);
  } catch (e) {
    console.error("supervise payment lookup failed:", e.message);
    return record;
  }
  if (!isPaidSessionFor(session, record)) return record;
  return (await markPaid({ store, id: record.id, sessionId: session.id })) || record;
}

// Stripe の通知（checkout.session.completed 等）から呼ぶ。
// 戻り値の ok が false のときは、通知を受け取った側で内容を見る（再送しても直らない場合を含む）。
export async function handlePaidSession({ store, session }) {
  const meta = session && session.metadata;
  if (!meta || meta.kind !== "supervise") return { ok: true, handled: false };
  const id = normalizeId(meta.requestId);
  if (!id) return { ok: false, reason: "bad_request_id" };
  const record = await store.get(id);
  if (!record) return { ok: false, reason: "record_missing", id };
  if (!isPaidSessionFor(session, record)) return { ok: false, reason: "mismatch", id };
  await markPaid({ store, id, sessionId: session.id });
  return { ok: true, handled: true, id };
}

// ---- 管理側の操作 -----------------------------------------------------------

export async function adminTransition({ store, id, to, note }) {
  const normalized = normalizeId(id);
  if (!normalized) throw new SuperviseError("bad_id", "依頼IDの形式が正しくありません。", 400);
  if (!ADMIN_TARGETS.has(to)) {
    throw new SuperviseError("bad_status", "指定できる状態は reviewing / delivered / cancelled です。", 400);
  }
  requireStore(store);
  const text = cleanText(note, 200);
  const next = await store.update(normalized, (r) => {
    if (r.status === to) return r; // 同じ状態への操作は何もしない
    if (!canTransition(r.status, to)) {
      throw new SuperviseError("bad_transition", `「${STATUS_LABEL[r.status]}」から「${STATUS_LABEL[to]}」へは変更できません。`, 409);
    }
    const at = new Date().toISOString();
    const entry = text ? { status: to, at, note: text } : { status: to, at };
    return { ...r, status: to, updatedAt: at, history: [...(r.history || []), entry] };
  });
  if (!next) throw new SuperviseError("not_found", "依頼が見つかりません。", 404);
  return next;
}

// 管理用の一覧に出す形。メモも含む。Stripe のセッションIDは含めない。
export function toAdminView(record) {
  return { ...toPublicView(record), history: (record.history || []).map((h) => ({ ...h })) };
}

// 管理用トークンの照合。未設定なら機能ごと停止（disabled）。
export function checkAdminToken(authorizationHeader, expected) {
  if (!expected) return "disabled";
  const m = /^Bearer (.+)$/.exec(typeof authorizationHeader === "string" ? authorizationHeader : "");
  if (!m) return "denied";
  // 長さの違いで時間差が出ないよう、ハッシュにそろえてから比べる
  const a = crypto.createHash("sha256").update(m[1]).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b) ? "ok" : "denied";
}
