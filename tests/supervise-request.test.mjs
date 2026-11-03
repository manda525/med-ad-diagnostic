// 監修の依頼トラッカー（料金・依頼ID・状態遷移・保存先・APIルート）の回帰テスト。
//
//   npm run test:supervise-request
//
// Stripe も Upstash も実際には呼ばない（どちらも偽物に差し替える）。外部通信も費用もかからない。
// 本番コードは ESM だが package.json は CJS 扱いなので、ソースを一時ディレクトリへ .mjs として
// 展開してから読み込む（tests/usage.test.mjs と同じ方法）。本番側のコードにはテスト用の細工を入れない。

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-ad-supervise-test-"));

process.env.APP_TOKEN_SECRET = "test_secret_for_unit_check_only";
process.env.SUPERVISE_ADMIN_TOKEN = "test-admin-token-not-a-real-secret";
process.env.STRIPE_WEBHOOK_SECRET = "test-webhook-secret-not-real";
delete process.env.VERCEL_ENV;
delete process.env.STRIPE_SECRET_KEY;
for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_KV_REST_API_URL", "UPSTASH_REDIS_REST_KV_REST_API_TOKEN"]) delete process.env[k];

// import 先の指定（"./x" や "../../../lib/x"）を、展開先の .mjs に付け替える
const LOCAL = ["supervise", "history", "entitlement", "usage", "requestStore", "superviseRequest",
  "superviseLocal", "superviseApi", "baseUrl", "stripe"];
function stage(src, dest) {
  let code = fs.readFileSync(path.join(root, src), "utf8");
  code = code.replace(/from "((?:\.\.\/)*(?:\.\/)?(?:lib\/)?)(\w+)"/g, (m, _p, name) =>
    LOCAL.includes(name) ? `from "./${name}.mjs"` : m);
  fs.writeFileSync(path.join(tmp, dest), code);
}
for (const n of ["supervise", "history", "entitlement", "usage", "requestStore", "superviseRequest",
  "superviseLocal", "superviseApi", "baseUrl"]) stage(`lib/${n}.js`, `${n}.mjs`);
// Stripe は偽物。本物の getStripe の代わりに、テストが差し込んだ偽物を返す
fs.writeFileSync(path.join(tmp, "stripe.mjs"), "export function getStripe() { if (!globalThis.__fakeStripe) throw new Error('STRIPE_SECRET_KEY is not set'); return globalThis.__fakeStripe; }\n");
for (const [file, dest] of [["create", "h_create"], ["resume", "h_resume"], ["status", "h_status"], ["admin", "h_admin"]]) {
  stage(`pages/api/supervise/${file}.js`, `${dest}.mjs`);
}
stage("pages/api/webhook.js", "h_webhook.mjs");

const load = (n) => import(pathToFileURL(path.join(tmp, `${n}.mjs`)).href);
const S = await load("supervise");
const R = await load("superviseRequest");
const Store = await load("requestStore");
const Local = await load("superviseLocal");
const H = {
  create: (await load("h_create")).default,
  resume: (await load("h_resume")).default,
  status: (await load("h_status")).default,
  admin: (await load("h_admin")).default,
  webhook: (await load("h_webhook")).default,
};

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};
const section = (s) => console.log(`\n[${s}]`);

// ---- 偽物 ------------------------------------------------------------------

function makeFakeStripe() {
  const sessions = new Map();
  let n = 0;
  const fake = {
    sessions,
    failCreate: false,
    checkout: {
      sessions: {
        async create(params) {
          if (fake.failCreate) throw new Error("stripe is down");
          const id = `cs_test_${++n}`;
          const amount = params.line_items.reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0);
          sessions.set(id, { id, params, payment_status: "unpaid", metadata: params.metadata, amount_total: amount, currency: "jpy" });
          return { id, url: `https://checkout.example/${id}` };
        },
        async retrieve(id) {
          if (!sessions.has(id)) throw new Error("no such session");
          return sessions.get(id);
        },
      },
    },
    webhooks: {
      constructEvent(raw, sig) {
        if (sig !== "valid") throw new Error("bad signature");
        return JSON.parse(raw.toString("utf8"));
      },
    },
    pay(id) { sessions.get(id).payment_status = "paid"; },
  };
  return fake;
}

function mockRes() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (over = {}) => ({ method: "POST", headers: { "x-forwarded-for": "10.9.0.1" }, body: {}, query: {}, socket: {}, ...over });
const call = async (h, r) => { const res = mockRes(); await h(r, res); return res; };

// 鍵の形をした文字列は、秘密情報の検査に引っかからないよう連結して作る
const LIVE = "sk" + "_live_dummy";
const TEST = "sk" + "_test_dummy";
const SAMPLE = { length: 1200, industryLabel: "物販・EC", subLabel: "サプリ", mediaLabel: "LP", judgment: "要修正", riskScore: 62 };
const ID_RE = /^SV-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

// ============================================================================
section("料金（3円/字・最低1万円・消費税は切り捨て）");
await t("最低料金：1文字でも税別10,000円・消費税1,000円・税込11,000円", () => {
  assert.deepEqual(R.feeBreakdown(1), { fee: 10000, tax: 1000, total: 11000 });
});
await t("3,333字は9,999円→最低の10,000円、3,334字は10,002円", () => {
  assert.equal(R.feeBreakdown(3333).fee, 10000);
  assert.deepEqual(R.feeBreakdown(3334), { fee: 10002, tax: 1000, total: 11002 });
});
await t("5,000字は税別15,000円・税込16,500円", () => {
  assert.deepEqual(R.feeBreakdown(5000), { fee: 15000, tax: 1500, total: 16500 });
});
await t("上限30,000字でも税込99,000円（Stripeの上限に十分収まる）", () => {
  assert.deepEqual(R.feeBreakdown(R.MAX_LENGTH), { fee: 90000, tax: 9000, total: 99000 });
});
await t("画面側（lib/supervise.js）と同じ値を返す", () => {
  assert.equal(S.feeBreakdown(2345).total, R.feeBreakdown(2345).total);
  assert.equal(R.yen(1234567), "1,234,567");
});

// ============================================================================
section("依頼ID");
await t("形式：SV-XXXX-XXXX-XXXX（I/L/O/0/1を含まない）", () => {
  for (let i = 0; i < 200; i++) assert.match(R.newRequestId(), ID_RE);
});
await t("2,000個作って重複しない", () => {
  const set = new Set(Array.from({ length: 2000 }, () => R.newRequestId()));
  assert.equal(set.size, 2000);
});
await t("normalizeId：小文字・前後の空白を直し、形式違いは null", () => {
  const id = R.newRequestId();
  assert.equal(R.normalizeId(`  ${id.toLowerCase()} `), id);
  for (const bad of ["", "SV-AAAA-BBBB", "SV-AAAA-BBBB-CCCI", "XX-AAAA-BBBB-CCCC", null, undefined, 123, "SV-AAAA-BBBB-CCCC-DDDD"]) {
    assert.equal(R.normalizeId(bad), null);
  }
});

// ============================================================================
section("作成リクエストの検証");
await t("正常な入力は通る。金額フィールドは受け取らない", () => {
  const v = R.parseCreateInput({ ...SAMPLE, fee: 1, total: 1, tax: 0 });
  assert.equal(v.length, 1200);
  assert.ok(!("fee" in v) && !("total" in v) && !("tax" in v));
});
await t("文字数：整数でない・0以下・上限超過は拒否", () => {
  for (const length of [0, -5, 1.5, "100", null, undefined, NaN, R.MAX_LENGTH + 1]) {
    assert.throws(() => R.parseCreateInput({ ...SAMPLE, length }), (e) => e instanceof R.SuperviseError && e.httpStatus === 400);
  }
});
await t("判定が空なら拒否。制御文字は落とし、長すぎる文字列は切る", () => {
  assert.throws(() => R.parseCreateInput({ ...SAMPLE, judgment: "  " }), R.SuperviseError);
  const v = R.parseCreateInput({ ...SAMPLE, industryLabel: "a\u0000b\nc".padEnd(100, "x") });
  assert.ok(!/[\u0000-\u001f]/.test(v.industryLabel));
  assert.ok(v.industryLabel.length <= 40);
});
await t("リスクスコアは0〜100に丸める。数でなければ null", () => {
  assert.equal(R.parseCreateInput({ ...SAMPLE, riskScore: 250 }).riskScore, 100);
  assert.equal(R.parseCreateInput({ ...SAMPLE, riskScore: "abc" }).riskScore, null);
});

// ============================================================================
section("Stripe Checkout の組み立て");
const REC = { id: "SV-AAAA-BBBB-CCCC", fee: 10002, tax: 1000, total: 11002, length: 3334 };
await t("単発払い・円・2行（監修料と消費税）で、合計が税込額と一致する", () => {
  const p = R.checkoutParams(REC, "https://example.test");
  assert.equal(p.mode, "payment");
  assert.equal(p.line_items.length, 2);
  assert.ok(p.line_items.every((l) => l.price_data.currency === "jpy" && Number.isInteger(l.price_data.unit_amount)));
  assert.equal(p.line_items.reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0), REC.total);
});
await t("メタデータに種別と依頼IDが入る。戻り先は同じオリジンの /supervise", () => {
  const p = R.checkoutParams(REC, "https://example.test");
  assert.deepEqual(p.metadata, { kind: "supervise", requestId: REC.id });
  assert.deepEqual(p.payment_intent_data.metadata, p.metadata);
  assert.equal(p.success_url, `https://example.test/supervise?id=${REC.id}&from=checkout`);
  assert.equal(p.cancel_url, `https://example.test/supervise?id=${REC.id}`);
});
await t("本番以外のデプロイでは live 鍵の決済を止める", () => {
  assert.equal(R.isLiveKeyOutsideProduction({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: LIVE }), true);
  assert.equal(R.isLiveKeyOutsideProduction({ VERCEL_ENV: "production", STRIPE_SECRET_KEY: LIVE }), false);
  assert.equal(R.isLiveKeyOutsideProduction({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: TEST }), false);
  assert.equal(R.isLiveKeyOutsideProduction({ STRIPE_SECRET_KEY: LIVE }), false); // ローカル
});

// ============================================================================
section("依頼の作成");
await t("作成すると「お支払い待ち」で保存され、支払いURLと依頼IDが返る", async () => {
  const store = Store.createMemoryStore(); const stripe = makeFakeStripe();
  const out = await R.createRequest({ store, stripe, body: SAMPLE, baseUrl: "https://example.test" });
  assert.match(out.id, ID_RE);
  assert.match(out.url, /^https:\/\/checkout\.example\//);
  const rec = await store.get(out.id);
  assert.equal(rec.status, "awaiting_payment");
  assert.deepEqual([rec.fee, rec.tax, rec.total], [10000, 1000, 11000]);
  assert.ok(rec.sessionId);
  assert.ok(!("text" in rec) && !("email" in rec), "原稿やメールアドレスは保存しない");
});
await t("クライアントが金額を送っても、サーバーの計算が使われる", async () => {
  const store = Store.createMemoryStore(); const stripe = makeFakeStripe();
  const out = await R.createRequest({ store, stripe, body: { ...SAMPLE, length: 5000, fee: 1, total: 1 }, baseUrl: "https://example.test" });
  const rec = await store.get(out.id);
  assert.equal(rec.total, 16500);
  const sent = stripe.sessions.get(rec.sessionId).amount_total;
  assert.equal(sent, 16500);
});
await t("Stripe が失敗したら、依頼を残さず 502 を返す", async () => {
  const store = Store.createMemoryStore(); const stripe = makeFakeStripe(); stripe.failCreate = true;
  await assert.rejects(R.createRequest({ store, stripe, body: SAMPLE, baseUrl: "https://example.test" }),
    (e) => e instanceof R.SuperviseError && e.httpStatus === 502);
  assert.equal((await store.list()).length, 0);
});
await t("保存先が使えないときは 503（支払い画面を作らない）", async () => {
  const stripe = makeFakeStripe();
  await assert.rejects(R.createRequest({ store: { available: () => false }, stripe, body: SAMPLE, baseUrl: "x" }),
    (e) => e instanceof R.SuperviseError && e.httpStatus === 503);
  assert.equal(stripe.sessions.size, 0);
});

// ============================================================================
section("支払いの反映（何度呼んでも同じ結果）");
async function fresh() {
  const store = Store.createMemoryStore(); const stripe = makeFakeStripe();
  const out = await R.createRequest({ store, stripe, body: SAMPLE, baseUrl: "https://example.test" });
  return { store, stripe, id: out.id, rec: await store.get(out.id) };
}
await t("未払いのままなら、確認しても「お支払い待ち」のまま", async () => {
  const { store, stripe, rec } = await fresh();
  const r = await R.reconcilePayment({ store, stripe, record: rec });
  assert.equal(r.status, "awaiting_payment");
});
await t("支払い済みなら「受付済み」に進み、履歴に残る。2回呼んでも履歴は増えない", async () => {
  const { store, stripe, id, rec } = await fresh();
  stripe.pay(rec.sessionId);
  const a = await R.reconcilePayment({ store, stripe, record: rec });
  assert.equal(a.status, "paid");
  const b = await R.reconcilePayment({ store, stripe, record: await store.get(id) });
  assert.equal(b.status, "paid");
  assert.deepEqual((await store.get(id)).history.map((h) => h.status), ["awaiting_payment", "paid"]);
});
await t("金額が違う・別の依頼のセッションは反映しない", async () => {
  const { store, stripe, id, rec } = await fresh();
  stripe.pay(rec.sessionId);
  stripe.sessions.get(rec.sessionId).amount_total = 1;
  assert.equal((await R.reconcilePayment({ store, stripe, record: rec })).status, "awaiting_payment");
  stripe.sessions.get(rec.sessionId).amount_total = rec.total;
  stripe.sessions.get(rec.sessionId).metadata = { kind: "supervise", requestId: "SV-ZZZZ-ZZZZ-ZZZZ" };
  assert.equal((await R.reconcilePayment({ store, stripe, record: rec })).status, "awaiting_payment");
  assert.equal((await store.get(id)).status, "awaiting_payment");
});
await t("Stripe に問い合わせて失敗しても、例外にせず現状を返す", async () => {
  const { store, rec } = await fresh();
  const broken = { checkout: { sessions: { retrieve: async () => { throw new Error("network"); } } } };
  assert.equal((await R.reconcilePayment({ store, stripe: broken, record: rec })).status, "awaiting_payment");
});
await t("確認中・納品済みの依頼は、支払いの通知で状態が戻らない", async () => {
  const { store, stripe, id, rec } = await fresh();
  stripe.pay(rec.sessionId);
  await R.reconcilePayment({ store, stripe, record: rec });
  await R.adminTransition({ store, id, to: "reviewing" });
  const session = stripe.sessions.get(rec.sessionId);
  const r = await R.handlePaidSession({ store, session });
  assert.equal(r.ok, true);
  assert.equal((await store.get(id)).status, "reviewing");
});
await t("通知：種別が違うセッションは無視、金額が違うものは反映しない", async () => {
  const { store, stripe, id, rec } = await fresh();
  const s = stripe.sessions.get(rec.sessionId); stripe.pay(rec.sessionId);
  assert.deepEqual(await R.handlePaidSession({ store, session: { metadata: { kind: "subscription" } } }), { ok: true, handled: false });
  assert.equal((await R.handlePaidSession({ store, session: { ...s, amount_total: 5 } })).ok, false);
  assert.equal((await store.get(id)).status, "awaiting_payment");
  assert.equal((await R.handlePaidSession({ store, session: s })).handled, true);
  assert.equal((await store.get(id)).status, "paid");
});

// ============================================================================
section("状態の遷移（一方向）");
await t("許可される遷移だけが true", () => {
  const ok = [["awaiting_payment", "cancelled"], ["paid", "reviewing"], ["paid", "delivered"], ["paid", "cancelled"],
    ["reviewing", "delivered"], ["reviewing", "cancelled"]];
  for (const [a, b] of ok) assert.equal(R.canTransition(a, b), true, `${a}→${b}`);
  const ng = [["paid", "awaiting_payment"], ["reviewing", "paid"], ["delivered", "reviewing"], ["delivered", "cancelled"],
    ["cancelled", "paid"], ["awaiting_payment", "paid"], ["awaiting_payment", "delivered"]];
  for (const [a, b] of ng) assert.equal(R.canTransition(a, b), false, `${a}→${b}`);
});
await t("管理操作：受付済み→確認中→納品済み。履歴に時刻とメモが残る", async () => {
  const { store, stripe, id, rec } = await fresh();
  stripe.pay(rec.sessionId); await R.reconcilePayment({ store, stripe, record: rec });
  await R.adminTransition({ store, id, to: "reviewing" });
  const done = await R.adminTransition({ store, id, to: "delivered", note: "納品メール送付" });
  assert.equal(done.status, "delivered");
  assert.deepEqual(done.history.map((h) => h.status), ["awaiting_payment", "paid", "reviewing", "delivered"]);
  assert.equal(done.history[3].note, "納品メール送付");
});
await t("管理操作では「受付済み」を作れない／支払い前に納品済みにはできない", async () => {
  const { store, id } = await fresh();
  await assert.rejects(R.adminTransition({ store, id, to: "paid" }), (e) => e.code === "bad_status");
  await assert.rejects(R.adminTransition({ store, id, to: "delivered" }), (e) => e.code === "bad_transition" && e.httpStatus === 409);
});
await t("同じ状態への操作は何も変えない。存在しないIDは 404、形式違いは 400", async () => {
  const { store, stripe, id, rec } = await fresh();
  stripe.pay(rec.sessionId); await R.reconcilePayment({ store, stripe, record: rec });
  await R.adminTransition({ store, id, to: "reviewing" });
  const again = await R.adminTransition({ store, id, to: "reviewing" });
  assert.equal(again.history.filter((h) => h.status === "reviewing").length, 1);
  await assert.rejects(R.adminTransition({ store, id: "SV-ZZZZ-ZZZZ-ZZZZ", to: "reviewing" }), (e) => e.httpStatus === 404);
  await assert.rejects(R.adminTransition({ store, id: "nope", to: "reviewing" }), (e) => e.httpStatus === 400);
});
await t("公開用の見え方に、セッションIDと管理メモは含めない", async () => {
  const { store, stripe, id, rec } = await fresh();
  stripe.pay(rec.sessionId); await R.reconcilePayment({ store, stripe, record: rec });
  const r = await R.adminTransition({ store, id, to: "reviewing", note: "社内メモ" });
  const view = R.toPublicView(r);
  assert.ok(!JSON.stringify(view).includes(rec.sessionId));
  assert.ok(!JSON.stringify(view).includes("社内メモ"));
});
await t("管理トークンの照合：未設定は disabled、違えば denied", () => {
  assert.equal(R.checkAdminToken("Bearer abc", undefined), "disabled");
  assert.equal(R.checkAdminToken("Bearer abc", "abc"), "ok");
  assert.equal(R.checkAdminToken("Bearer abd", "abc"), "denied");
  assert.equal(R.checkAdminToken("abc", "abc"), "denied");
  assert.equal(R.checkAdminToken(undefined, "abc"), "denied");
  assert.equal(R.checkAdminToken("Bearer ", "abc"), "denied");
});

// ============================================================================
section("保存先");
await t("メモリ：同じIDの二重作成は失敗。一覧は新しい順", async () => {
  const store = Store.createMemoryStore();
  const mk = (id, at) => ({ id, status: "paid", createdAt: at, history: [] });
  assert.equal(await store.create(mk("A", "2026-11-01T00:00:00Z")), true);
  assert.equal(await store.create(mk("A", "2026-11-02T00:00:00Z")), false);
  await store.create(mk("B", "2026-11-03T00:00:00Z"));
  assert.deepEqual((await store.list()).map((r) => r.id), ["B", "A"]);
});
await t("メモリ：回数制限は上限を超えたら false", async () => {
  const store = Store.createMemoryStore();
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await store.hit("k", 3, 60));
  assert.deepEqual(results, [true, true, true, false, false]);
});
await t("保存期間：お支払い待ちは3日、それ以降は400日", () => {
  assert.equal(Store.ttlFor({ status: "awaiting_payment" }), Store.TTL_UNPAID_SEC);
  assert.equal(Store.ttlFor({ status: "paid" }), Store.TTL_PAID_SEC);
  assert.ok(Store.TTL_UNPAID_SEC < Store.TTL_PAID_SEC);
});
await t("Vercel 上（VERCEL_ENV あり）で Upstash が無いときは、メモリに退避せず「使えない」を返す", () => {
  process.env.VERCEL_ENV = "production";
  try {
    const s = Store.getStore();
    assert.equal(s.available(), false);
    assert.equal(s.backend, "none");
  } finally { delete process.env.VERCEL_ENV; }
});
await t("ローカル（VERCEL_ENV なし）ではメモリを使い、呼び出しをまたいで同じ実体を返す", () => {
  const a = Store.getStore(); const b = Store.getStore();
  assert.equal(a.backend, "memory");
  assert.equal(a, b);
});

// Upstash REST の偽物：本番と同じコマンドの並びを受け、Lua の中身は同じ意味の処理で置き換える
function installFakeUpstash() {
  const kv = new Map(); const z = new Map(); const log = [];
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const cmd = JSON.parse(init.body); log.push(cmd);
    const [op, ...a] = cmd; let result = null;
    switch (op) {
      case "GET": result = kv.has(a[0]) ? kv.get(a[0]) : null; break;
      case "SET": {
        const nx = a.includes("NX");
        if (nx && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = "OK"; }
        break;
      }
      case "DEL": result = kv.delete(a[0]) ? 1 : 0; break;
      case "ZADD": z.set(a[2], Number(a[1])); result = 1; break;
      case "ZREM": z.delete(a[0] === "mad:sup:idx" ? a[1] : a[0]); result = 1; break;
      case "ZREMRANGEBYRANK": result = 0; break;
      case "ZREVRANGE": result = [...z.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id).slice(0, Number(a[2]) + 1); break;
      case "MGET": result = a.map((k) => (kv.has(k) ? kv.get(k) : null)); break;
      case "EVAL": {
        const [script, , key, ...argv] = a;
        if (script.includes("if cur == ARGV[1]")) { // 値が変わっていなければ書く
          if (kv.get(key) === argv[0]) { kv.set(key, argv[1]); result = 1; } else result = 0;
        } else { // 回数制限
          const n = Number(kv.get(key) || 0) + 1;
          if (n > Number(argv[0])) result = 0; else { kv.set(key, String(n)); result = 1; }
        }
        break;
      }
      default: throw new Error(`unexpected command ${op}`);
    }
    return { ok: true, json: async () => ({ result }) };
  };
  return {
    kv, log,
    restore() {
      globalThis.fetch = realFetch;
      delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
    },
  };
}

await t("Upstash 経由：作成→取得→更新→一覧→削除が通り、TTL と NX が付く", async () => {
  const up = installFakeUpstash();
  try {
    const store = Store.getStore();
    assert.equal(store.backend, "redis");
    const rec = { id: "SV-AAAA-BBBB-CCCC", status: "awaiting_payment", createdAt: "2026-11-03T00:00:00.000Z", history: [] };
    assert.equal(await store.create(rec), true);
    assert.equal(await store.create(rec), false, "二重作成は NX で弾かれる");
    const set = up.log.find((c) => c[0] === "SET");
    assert.deepEqual(set.slice(3), ["EX", String(Store.TTL_UNPAID_SEC), "NX"]);
    const updated = await store.update(rec.id, (r) => ({ ...r, status: "paid" }));
    assert.equal(updated.status, "paid");
    const eval_ = up.log.find((c) => c[0] === "EVAL");
    assert.equal(eval_[eval_.length - 1], String(Store.TTL_PAID_SEC), "支払い後は長い保存期間で書き直す");
    assert.equal((await store.get(rec.id)).status, "paid");
    assert.deepEqual((await store.list()).map((r) => r.id), [rec.id]);
    await store.remove(rec.id);
    assert.equal(await store.get(rec.id), null);
  } finally { up.restore(); }
});
await t("Upstash 経由：読んでから書くまでに別の更新が入ったら、読み直してやり直す", async () => {
  const up = installFakeUpstash();
  try {
    const store = Store.getStore();
    const rec = { id: "SV-DDDD-EEEE-FFFF", status: "paid", createdAt: "2026-11-03T00:00:00.000Z", history: [], n: 0 };
    await store.create(rec);
    let first = true;
    const out = await store.update(rec.id, (r) => {
      if (first) { first = false; up.kv.set("mad:sup:req:" + rec.id, JSON.stringify({ ...r, n: 100 })); } // 割り込み
      return { ...r, n: r.n + 1 };
    });
    assert.equal(out.n, 101, "割り込まれた値を土台にやり直している");
  } finally { up.restore(); }
});
await t("Upstash 経由：回数制限が上限で false になる", async () => {
  const up = installFakeUpstash();
  try {
    const store = Store.getStore();
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await store.hit("lim", 2, 60));
    assert.deepEqual(r, [true, true, false, false]);
  } finally { up.restore(); }
});

// ============================================================================
section("APIルート");
globalThis.__fakeStripe = makeFakeStripe();
const fs1 = globalThis.__fakeStripe;
let createdId = null;

await t("create：POST 以外は 405。本番以外で live 鍵なら 403", async () => {
  assert.equal((await call(H.create, req({ method: "GET" }))).statusCode, 405);
  process.env.VERCEL_ENV = "preview"; process.env.STRIPE_SECRET_KEY = LIVE;
  try { assert.equal((await call(H.create, req({ body: SAMPLE }))).statusCode, 403); }
  finally { delete process.env.VERCEL_ENV; delete process.env.STRIPE_SECRET_KEY; }
});
await t("create：検証エラーは 400、成功は 200 で依頼IDと支払いURL", async () => {
  const bad = await call(H.create, req({ body: { ...SAMPLE, length: 0 }, headers: { "x-forwarded-for": "10.9.1.1" } }));
  assert.equal(bad.statusCode, 400);
  const ok = await call(H.create, req({ body: SAMPLE, headers: { "x-forwarded-for": "10.9.1.2", host: "example.test" } }));
  assert.equal(ok.statusCode, 200);
  assert.match(ok.body.id, ID_RE);
  createdId = ok.body.id;
  assert.equal(ok.headers["Cache-Control"], "no-store");
});
await t("create：同じIPから1時間に9回目は 429", async () => {
  const headers = { "x-forwarded-for": "10.9.2.2" };
  const codes = [];
  for (let i = 0; i < 9; i++) codes.push((await call(H.create, req({ body: SAMPLE, headers }))).statusCode);
  assert.deepEqual(codes.slice(0, 8), Array(8).fill(200));
  assert.equal(codes[8], 429);
});
await t("create：本番相当で保存先が無ければ 503（支払い画面を作らない）", async () => {
  process.env.VERCEL_ENV = "production";
  const before = fs1.sessions.size;
  try {
    const res = await call(H.create, req({ body: SAMPLE, headers: { "x-forwarded-for": "10.9.3.3" } }));
    assert.equal(res.statusCode, 503);
    assert.equal(fs1.sessions.size, before);
  } finally { delete process.env.VERCEL_ENV; }
});
await t("status：形式違い・存在しないIDは 404、存在すれば公開用の内容だけ返す", async () => {
  const h = { "x-forwarded-for": "10.9.4.4" };
  assert.equal((await call(H.status, req({ method: "GET", query: { id: "bad" }, headers: h }))).statusCode, 404);
  assert.equal((await call(H.status, req({ method: "GET", query: { id: "SV-ZZZZ-ZZZZ-ZZZZ" }, headers: h }))).statusCode, 404);
  const ok = await call(H.status, req({ method: "GET", query: { id: createdId.toLowerCase() }, headers: h }));
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.status, "awaiting_payment");
  assert.ok(!("sessionId" in ok.body));
});
await t("status：Stripe で支払い済みになっていれば、問い合わせた時点で「受付済み」になる", async () => {
  const h = { "x-forwarded-for": "10.9.4.5" };
  const rec = await Store.getStore().get(createdId);
  fs1.pay(rec.sessionId);
  const res = await call(H.status, req({ method: "GET", query: { id: createdId }, headers: h }));
  assert.equal(res.body.status, "paid");
});
await t("resume：支払い済みの依頼には新しい支払い画面を作らない", async () => {
  const before = fs1.sessions.size;
  const res = await call(H.resume, req({ body: { id: createdId }, headers: { "x-forwarded-for": "10.9.5.5" } }));
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.url);
  assert.equal(fs1.sessions.size, before);
});
await t("resume：お支払い待ちなら新しい支払いURLを返す。存在しなければ 404", async () => {
  const mk = await call(H.create, req({ body: SAMPLE, headers: { "x-forwarded-for": "10.9.5.6" } }));
  const res = await call(H.resume, req({ body: { id: mk.body.id }, headers: { "x-forwarded-for": "10.9.5.7" } }));
  assert.equal(res.statusCode, 200);
  assert.match(res.body.url, /^https:\/\/checkout\.example\//);
  assert.equal((await call(H.resume, req({ body: { id: "SV-ZZZZ-ZZZZ-ZZZZ" }, headers: { "x-forwarded-for": "10.9.5.8" } }))).statusCode, 404);
});
const authed = (over = {}) => req({ headers: { "x-forwarded-for": "10.9.6.1", authorization: `Bearer ${process.env.SUPERVISE_ADMIN_TOKEN}` }, ...over });
await t("admin：トークン未設定なら 503、違えば 401、10回失敗で 429", async () => {
  const saved = process.env.SUPERVISE_ADMIN_TOKEN; delete process.env.SUPERVISE_ADMIN_TOKEN;
  try { assert.equal((await call(H.admin, req({ method: "GET", headers: { authorization: "Bearer x" } }))).statusCode, 503); }
  finally { process.env.SUPERVISE_ADMIN_TOKEN = saved; }
  const headers = { "x-forwarded-for": "10.9.6.9", authorization: "Bearer wrong" };
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await call(H.admin, req({ method: "GET", headers }))).statusCode);
  assert.equal(codes[0], 401);
  assert.equal(codes[11], 429);
});
await t("admin：一覧（状態で絞れる）と、状態の更新ができる", async () => {
  const list = await call(H.admin, authed({ method: "GET" }));
  assert.equal(list.statusCode, 200);
  assert.ok(list.body.requests.some((r) => r.id === createdId));
  const paidOnly = await call(H.admin, authed({ method: "GET", query: { status: "paid" } }));
  assert.ok(paidOnly.body.requests.every((r) => r.status === "paid"));
  const set = await call(H.admin, authed({ body: { id: createdId, to: "reviewing", note: "原稿受領" } }));
  assert.equal(set.statusCode, 200);
  assert.equal(set.body.status, "reviewing");
  const ng = await call(H.admin, authed({ body: { id: createdId, to: "paid" } }));
  assert.equal(ng.statusCode, 400);
  const back = await call(H.admin, authed({ body: { id: "SV-ZZZZ-ZZZZ-ZZZZ", to: "delivered" } }));
  assert.equal(back.statusCode, 404);
});

// ============================================================================
section("Stripe の通知（webhook）");
const hook = async (event, { sig = "valid" } = {}) => {
  const body = Buffer.from(JSON.stringify(event));
  const r = Object.assign(Readable.from([body]), { method: "POST", headers: { "stripe-signature": sig } });
  return call(H.webhook, r);
};
await t("監修の支払い完了の通知で「受付済み」になる。署名が不正なら 400", async () => {
  const mk = await call(H.create, req({ body: SAMPLE, headers: { "x-forwarded-for": "10.9.7.1" } }));
  const rec = await Store.getStore().get(mk.body.id);
  fs1.pay(rec.sessionId);
  const session = fs1.sessions.get(rec.sessionId);
  assert.equal((await hook({ type: "checkout.session.completed", data: { object: session } }, { sig: "forged" })).statusCode, 400);
  assert.equal((await Store.getStore().get(rec.id)).status, "awaiting_payment");
  const ok = await hook({ type: "checkout.session.completed", data: { object: session } });
  assert.equal(ok.statusCode, 200);
  assert.equal((await Store.getStore().get(rec.id)).status, "paid");
});
await t("監修以外の通知（サブスク等）は従来どおり 200 で受け流す", async () => {
  const res = await hook({ type: "customer.subscription.created", data: { object: { id: "sub_1", customer: "cus_1" } } });
  assert.equal(res.statusCode, 200);
  const res2 = await hook({ type: "checkout.session.completed", data: { object: { id: "cs_x", metadata: {}, customer: "cus_1" } } });
  assert.equal(res2.statusCode, 200);
});
await t("保存先に書けないときは 500 を返す（Stripe が再送する）", async () => {
  const mk = await call(H.create, req({ body: SAMPLE, headers: { "x-forwarded-for": "10.9.7.2" } }));
  const rec = await Store.getStore().get(mk.body.id);
  fs1.pay(rec.sessionId);
  const session = fs1.sessions.get(rec.sessionId);
  process.env.VERCEL_ENV = "production"; // Upstash なし＝保存先なし
  try {
    const res = await hook({ type: "checkout.session.completed", data: { object: session } });
    assert.equal(res.statusCode, 500);
  } finally { delete process.env.VERCEL_ENV; }
});

// ============================================================================
section("この端末に残す原稿の控え");
class FakeStorage {
  constructor({ maxChars = Infinity } = {}) { this.m = new Map(); this.maxChars = maxChars; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    if (String(v).length > this.maxChars) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; }
    this.m.set(k, String(v));
  }
  removeItem(k) { this.m.delete(k); }
}
const entry = (n, text = "原稿") => ({ id: `SV-AAAA-BBBB-T${n}`, createdAt: `2026-11-03T00:${String(n).padStart(2, "0")}:00.000Z`, text, meta: { length: text.length } });
await t("保存して読み戻せる。同じIDは置き換え、新しい順に並ぶ", () => {
  const st = new FakeStorage();
  assert.equal(Local.saveLocal(st, entry(1)), true);
  Local.saveLocal(st, entry(2));
  Local.saveLocal(st, { ...entry(1), text: "更新後" });
  const list = Local.readLocal(st);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, entry(2).id);
  assert.equal(Local.getLocal(st, entry(1).id).text, "更新後");
});
await t("20件を超えたら古いものから落とす。削除できる", () => {
  const st = new FakeStorage();
  for (let i = 1; i <= 25; i++) Local.saveLocal(st, { ...entry(i), id: `SV-AAAA-BBBB-${i}` });
  assert.equal(Local.readLocal(st).length, Local.SUP_LOCAL_MAX);
  Local.removeLocal(st, "SV-AAAA-BBBB-25");
  assert.equal(Local.getLocal(st, "SV-AAAA-BBBB-25"), null);
});
await t("容量超過のときは古いものを落として再試行。壊れたデータ・保存先なしでも落ちない", () => {
  const st = new FakeStorage({ maxChars: 3000 });
  for (let i = 1; i <= 5; i++) Local.saveLocal(st, { ...entry(i, "あ".repeat(500)), id: `SV-AAAA-BBBB-${i}` });
  assert.ok(Local.readLocal(st).length >= 1);
  const bad = new FakeStorage(); bad.setItem(Local.SUP_LOCAL_KEY, "{not json");
  assert.deepEqual(Local.readLocal(bad), []);
  assert.equal(Local.saveLocal(null, entry(1)), false);
  assert.deepEqual(Local.readLocal(null), []);
});

// ============================================================================
section("メール文面に依頼IDを入れる");
await t("依頼IDは件名の頭と本文の先頭に入り、支払い済みの旨も付く", () => {
  const common = { industryLabel: "物販・EC", subLabel: "", mediaLabel: "LP", judgment: "要修正", riskScore: 60, length: 1200, fee: 10000, requestId: "SV-AAAA-BBBB-CCCC", paidTotal: 11000 };
  assert.match(S.buildSubject(common), /^【監修申込 SV-AAAA-BBBB-CCCC】/);
  const lines = S.buildMetaLines(common);
  assert.equal(lines[0], "【依頼ID】SV-AAAA-BBBB-CCCC");
  assert.match(lines[1], /お支払い.*完了済み.*11,000/);
});
await t("依頼IDなしの従来の申込（メールだけの経路）は文面が変わらない", () => {
  const common = { industryLabel: "物販・EC", subLabel: "", mediaLabel: "LP", judgment: "要修正", riskScore: 60, length: 1200, fee: 10000 };
  assert.match(S.buildSubject(common), /^【監修申込】/);
  assert.ok(!S.buildMetaLines(common).some((l) => l.includes("依頼ID")));
});
await t("依頼IDを入れても mailto は長さ上限内（原稿の量に依存しない）", () => {
  const subject = S.buildSubject({ industryLabel: "物販・EC", length: 30000, fee: 90000, requestId: "SV-AAAA-BBBB-CCCC" });
  assert.ok(S.buildMailto({ email: "masa@med-ad-masa.com", subject }).length <= S.MAILTO_SAFE_LEN);
});

console.log(`\n=== pass ${pass} / fail ${fail} ===`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
