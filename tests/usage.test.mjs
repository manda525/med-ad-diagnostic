// 利用枠・レート制限・請求ポータルの回帰テスト
//
//   npm run test:security
//
// AI も Stripe も実際には呼ばない。Stripe はモックに差し替える。
// 決定的なテストなので、実行に費用も外部通信もかからない。
//
// 本番コードは ESM だが package.json は CJS 扱いなので Node から直接 import できない。
// ここではソースを一時ディレクトリへ .mjs として展開してから読み込む。production 側には手を入れない。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-ad-usage-test-"));

process.env.APP_TOKEN_SECRET = process.env.APP_TOKEN_SECRET || "test_secret_for_unit_check_only";

function stage(src, dest, rewrites = []) {
  let code = fs.readFileSync(path.join(root, src), "utf8");
  for (const [from, to] of rewrites) code = code.replaceAll(from, to);
  fs.writeFileSync(path.join(tmp, dest), code);
}

stage("lib/entitlement.js", "entitlement.mjs");
stage("lib/baseUrl.js", "baseUrl.mjs");
stage("lib/usage.js", "usage.mjs", [['"./entitlement"', '"./entitlement.mjs"']]);
stage("pages/api/portal.js", "portal.mjs", [
  ['"../../lib/stripe"', '"./stripe.mjs"'],
  ['"../../lib/baseUrl"', '"./baseUrl.mjs"'],
  ['"../../lib/entitlement"', '"./entitlement.mjs"'],
]);

// Stripe のモック。呼び出し内容を記録し、必要なら例外を投げる。
fs.writeFileSync(
  path.join(tmp, "stripe.mjs"),
  `export function getStripe() {
     const m = globalThis.__stripeMock;
     return {
       billingPortal: {
         sessions: {
           create: async (params) => {
             m.calls.push(params);
             if (m.shouldThrow) throw new Error("stripe unavailable");
             return { url: "https://billing.example/session" };
           },
         },
       },
     };
   }`
);

const load = (f) => import(pathToFileURL(path.join(tmp, f)).href);
const u = await load("usage.mjs");
const { signToken } = await load("entitlement.mjs");
const portal = (await load("portal.mjs")).default;

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  ok   " + name); return; }
  failures.push(detail ? `${name} — ${detail}` : name);
  console.log("  NG   " + name + (detail ? `  （${detail}）` : ""));
}

const mockRes = () => ({
  headers: {}, statusCode: null, body: null,
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
});

// =============================================================
console.log("1. 訪問者IDの発行と検証");
// =============================================================
const res1 = mockRes();
const id1 = u.resolveVisitorId({ headers: {}, cookies: {} }, res1);
const setCookie = res1.headers["Set-Cookie"] || "";
check("訪問者IDが発行される", typeof id1 === "string" && id1.length > 10);
check("Cookie が HttpOnly", /HttpOnly/.test(setCookie));
check("Cookie が SameSite=Lax", /SameSite=Lax/.test(setCookie));

const cookieVal = decodeURIComponent(setCookie.split(";")[0].split("=").slice(1).join("="));
const res2 = mockRes();
check("同じCookieなら同じ訪問者IDになる",
  u.resolveVisitorId({ headers: {}, cookies: { mad_vid: cookieVal } }, res2) === id1);
check("既存Cookieがあれば再発行しない", res2.headers["Set-Cookie"] === undefined);
check("署名が合わないCookieは信用しない",
  u.resolveVisitorId({ headers: {}, cookies: { mad_vid: cookieVal.split(".")[0] + ".AAAAAAAAAAAAAAAAAAAAAAAAAAAA" } }, mockRes()) !== id1);

const forgedBody = Buffer.from(JSON.stringify({ v: "someone-elses-id", exp: 9999999999 }), "utf8")
  .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
check("他人の訪問者IDを詐称したCookieは通らない",
  u.resolveVisitorId({ headers: {}, cookies: { mad_vid: `${forgedBody}.${cookieVal.split(".")[1]}` } }, mockRes()) !== "someone-elses-id");

// =============================================================
console.log("2. 無料枠の上限（逐次）");
// =============================================================
{
  const who = { visitorId: "seq-A", ip: "10.1.0.1", pro: false };
  let blockedAt = null;
  for (let i = 1; i <= 8; i++) {
    const q = await u.reserveQuota(who);
    if (!q.allowed && q.status === 402) { blockedAt = i; break; }
  }
  check(`無料枠は${u.FREE_HARD_LIMIT}回まで通り、次で402になる`, blockedAt === u.FREE_HARD_LIMIT + 1,
    `実際は${blockedAt}回目でブロック`);
}

// =============================================================
console.log("3. 同時実行：20件を並行送信しても成功は6件まで");
// これが本テストの中心。確認してから加算する方式だと全部通り抜ける。
// =============================================================
{
  const who = { visitorId: "conc-A", ip: "10.2.0.1", pro: false };
  const results = await Promise.all(Array.from({ length: 20 }, () => u.reserveQuota(who)));
  const allowed = results.filter((r) => r.allowed).length;
  const paymentRequired = results.filter((r) => r.status === 402).length;
  console.log(`   許可 ${allowed}件 / 402 ${paymentRequired}件 / その他 ${20 - allowed - paymentRequired}件`);
  check("同時20件でも許可は6件を超えない", allowed <= u.FREE_HARD_LIMIT, `許可 ${allowed}件`);
  check("同時20件で許可はちょうど6件", allowed === u.FREE_HARD_LIMIT, `許可 ${allowed}件`);

  const after = await u.readUsage(who);
  check("予約後の残数が正しい（used=6）", after.used === u.FREE_HARD_LIMIT, `used=${after.used}`);
}

// 訪問者は同じでIPを散らしても、訪問者単位の枠は6件で止まる
{
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => u.reserveQuota({ visitorId: "conc-B", ip: `10.3.0.${i + 1}`, pro: false }))
  );
  const allowed = results.filter((r) => r.allowed).length;
  check("IPを分散させても訪問者単位で6件に収まる", allowed === u.FREE_HARD_LIMIT, `許可 ${allowed}件`);
}

// =============================================================
console.log("4. 失敗した診断の予約は戻る");
// =============================================================
{
  const who = { visitorId: "rel-A", ip: "10.4.0.1", pro: false };
  const q = await u.reserveQuota(who);
  check("予約が取れる", q.allowed === true);
  const mid = await u.readUsage(who);
  await u.releaseQuota(q.reservation);
  const after = await u.readUsage(who);
  check("予約中は加算されている", mid.used === 1, `used=${mid.used}`);
  check("戻すと元の値に復帰する", after.used === 0, `used=${after.used}`);
}

// =============================================================
console.log("5. Pro は無料枠の対象外");
// =============================================================
{
  const q = await u.reserveQuota({ visitorId: "conc-A", ip: "10.5.0.1", pro: true });
  check("上限に達した訪問者でも Pro なら通る", q.allowed === true);
  check("Pro は予約を持たない（戻す対象がない）", q.reservation === null);
}

// =============================================================
console.log("6. IP単位の連打制限（10分あたり）");
// =============================================================
{
  const who = { visitorId: null, ip: "10.6.0.1", pro: true }; // pro=true で402を除外し429だけ見る
  let limitedAt = null;
  for (let i = 1; i <= 20; i++) {
    const r = await u.reserveQuota(who);
    if (!r.allowed && r.status === 429) { limitedAt = i; break; }
  }
  check(`連打が${u.LIMITS.burstPerIpPerWindow}回を超えると429`, limitedAt === u.LIMITS.burstPerIpPerWindow + 1, `${limitedAt}回目で発動`);
  check("別IPは巻き添えにならない", (await u.reserveQuota({ visitorId: null, ip: "10.6.0.2", pro: true })).allowed === true);
}

// =============================================================
console.log("7. Cookieを保持しない利用者への対策（IP単位の1日上限）");
// 連打制限の窓が明けても、同じIPからは1日12回で止まること
// =============================================================
{
  const ip = "10.7.0.1";
  let ok = 0;
  for (let i = 0; i < u.LIMITS.freePerIpPerDay; i++) {
    // Cookie を保持しない利用者を模して、毎回別の訪問者IDにする
    const r = await u.reserveQuota({ visitorId: `nocookie-${i}`, ip, pro: false });
    if (r.allowed) ok++;
  }
  check(`Cookieを変えても1日${u.LIMITS.freePerIpPerDay}件までは通る`, ok === u.LIMITS.freePerIpPerDay, `${ok}件`);

  // 連打の窓（10分）を跨がせる。日単位のキーは残るため、次は日次上限で止まるはず。
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60 * 1000;
  const after = await u.reserveQuota({ visitorId: "nocookie-next", ip, pro: false });
  Date.now = realNow;

  check("連打の窓が明けても、1日の上限で止まる", !after.allowed && after.status === 429, `allowed=${after.allowed} status=${after.status}`);
  check("メッセージが日次上限のものになっている", /本日/.test(after.error || ""), after.error);
}

// =============================================================
console.log("8. IPを平文で保存しない / 秘密鍵が無ければ動かない");
// =============================================================
{
  const ip = "203.0.113.45";
  const h = u.hashIp(ip);
  check("変換結果にIPそのものが含まれない", !h.includes(ip) && !h.includes("203"));
  check("変換結果は固定長の16進", /^[0-9a-f]{16}$/.test(h), h);
  check("同じIPなら同じ値になる（判定に使える）", u.hashIp(ip) === h);
  check("違うIPなら違う値になる", u.hashIp("203.0.113.46") !== h);
  check("IPv6でも扱える", /^[0-9a-f]{16}$/.test(u.hashIp("2001:db8::1")));

  const before = process.env.APP_TOKEN_SECRET;
  process.env.APP_TOKEN_SECRET = before + "-different";
  check("鍵が違えば同じIPでも別の値になる", u.hashIp(ip) !== h);

  delete process.env.APP_TOKEN_SECRET;
  check("鍵が無ければ設定不足と判定される", u.isSecretConfigured() === false);
  let threw = false;
  try { u.hashIp(ip); } catch { threw = true; }
  check("鍵が無ければ既定値で誤魔化さず例外を投げる", threw);
  process.env.APP_TOKEN_SECRET = before;
  check("鍵があれば設定済みと判定される", u.isSecretConfigured() === true);
}

// =============================================================
console.log("9. ストアの解決とフォールバック");
// =============================================================
{
  check("Upstash未設定ならメモリで動く", u.storeBackend() === "memory");
  const cases = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["UPSTASH_REDIS_REST_KV_REST_API_URL", "UPSTASH_REDIS_REST_KV_REST_API_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ];
  for (const [urlVar, tokenVar] of cases) {
    process.env[urlVar] = "https://example.upstash.io";
    process.env[tokenVar] = "dummy-token";
    check(`${urlVar} を認識する`, u.storeBackend() === "redis");
    delete process.env[urlVar];
    delete process.env[tokenVar];
  }
  process.env.KV_REST_API_URL = "https://example.upstash.io";
  const backend = u.storeBackend();
  delete process.env.KV_REST_API_URL;
  check("片方だけではストアとして扱わない", backend === "memory");
}

// =============================================================
console.log("10. 請求ポータル（Stripeはモック）");
// =============================================================
{
  const reset = () => { globalThis.__stripeMock = { calls: [], shouldThrow: false }; };
  const token = signToken({ c: "cus_OWNER", s: "sub_OWNER", exp: Math.floor(Date.now() / 1000) + 3600 });
  const req = (headers, body) => ({ method: "POST", headers: { host: "example.test", ...headers }, body });

  // 正常系：トークン内の顧客IDでポータルを作る
  reset();
  let res = mockRes();
  await portal(req({ "x-entitlement-token": token }, {}), res);
  check("正しいトークンなら200を返す", res.statusCode === 200, `status=${res.statusCode}`);
  check("返り値にポータルURLが入る", res.body?.url === "https://billing.example/session");
  check("トークン内の顧客IDでStripeを呼ぶ", globalThis.__stripeMock.calls[0]?.customer === "cus_OWNER",
    JSON.stringify(globalThis.__stripeMock.calls[0]));

  // ボディの customerId は無視される
  reset();
  res = mockRes();
  await portal(req({ "x-entitlement-token": token }, { customerId: "cus_SOMEONE_ELSE" }), res);
  check("ボディのcustomerIdは無視される", globalThis.__stripeMock.calls[0]?.customer === "cus_OWNER",
    `渡された値: ${globalThis.__stripeMock.calls[0]?.customer}`);

  // トークンなし
  reset();
  res = mockRes();
  await portal(req({}, { customerId: "cus_SOMEONE_ELSE" }), res);
  check("トークンが無ければ401", res.statusCode === 401, `status=${res.statusCode}`);
  check("トークンが無ければStripeを呼ばない", globalThis.__stripeMock.calls.length === 0);

  // 改ざんトークン
  reset();
  res = mockRes();
  await portal(req({ "x-entitlement-token": token.split(".")[0] + ".AAAAAAAAAAAAAAAAAAAAAAAAAAAA" }, {}), res);
  check("改ざんトークンは401", res.statusCode === 401, `status=${res.statusCode}`);
  check("改ざんトークンではStripeを呼ばない", globalThis.__stripeMock.calls.length === 0);

  // 期限切れトークン
  reset();
  res = mockRes();
  const expired = signToken({ c: "cus_OWNER", s: "sub_OWNER", exp: Math.floor(Date.now() / 1000) - 10 });
  await portal(req({ "x-entitlement-token": expired }, {}), res);
  check("期限切れトークンは401", res.statusCode === 401, `status=${res.statusCode}`);

  // Stripe 側の障害
  reset();
  globalThis.__stripeMock.shouldThrow = true;
  res = mockRes();
  await portal(req({ "x-entitlement-token": token }, {}), res);
  check("Stripeが失敗したら500", res.statusCode === 500, `status=${res.statusCode}`);
  check("Stripe障害時に内部情報を返さない", !/stripe unavailable/i.test(JSON.stringify(res.body)), JSON.stringify(res.body));

  // GET は拒否
  reset();
  res = mockRes();
  await portal({ method: "GET", headers: {}, body: {} }, res);
  check("POST以外は405", res.statusCode === 405, `status=${res.statusCode}`);
}

// =============================================================
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n=== pass ${pass} / fail ${failures.length} ===`);
if (failures.length) {
  console.log("失敗:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
