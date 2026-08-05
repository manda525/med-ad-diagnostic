// 利用枠とレート制限の回帰テスト
//
//   npm run test:security
//
// AI も Stripe も呼ばない。lib/usage.js の判定ロジックだけを対象にした決定的なテストなので、
// 実行に費用も外部通信もかからない。ストアは未設定＝プロセス内メモリで走る。
//
// 本番コードは ESM だが package.json は CJS 扱いなので Node から直接 import できない。
// ここではソースを一時ディレクトリへ .mjs として展開してから読み込む。production 側には手を入れない。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-ad-usage-test-"));

fs.writeFileSync(path.join(tmp, "entitlement.mjs"), fs.readFileSync(path.join(root, "lib/entitlement.js"), "utf8"));
fs.writeFileSync(
  path.join(tmp, "usage.mjs"),
  fs.readFileSync(path.join(root, "lib/usage.js"), "utf8").replace('"./entitlement"', '"./entitlement.mjs"')
);

process.env.APP_TOKEN_SECRET = process.env.APP_TOKEN_SECRET || "test_secret_for_unit_check_only";
const u = await import(pathToFileURL(path.join(tmp, "usage.mjs")).href);

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  ok   " + name); return; }
  failures.push(detail ? `${name} — ${detail}` : name);
  console.log("  NG   " + name);
}

const mockRes = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; } });

// =============================================================
console.log("1. 訪問者IDの発行と検証");
// =============================================================
const res1 = mockRes();
const id1 = u.resolveVisitorId({ headers: {}, cookies: {} }, res1);
const setCookie = res1.headers["Set-Cookie"] || "";
check("訪問者IDが発行される", typeof id1 === "string" && id1.length > 10);
check("Cookie が HttpOnly", /HttpOnly/.test(setCookie));
check("Cookie が SameSite=Lax", /SameSite=Lax/.test(setCookie));
check("Cookie に有効期限がある", /Max-Age=\d+/.test(setCookie));

const cookieVal = decodeURIComponent(setCookie.split(";")[0].split("=").slice(1).join("="));
const res2 = mockRes();
check("同じCookieなら同じ訪問者IDになる",
  u.resolveVisitorId({ headers: {}, cookies: { mad_vid: cookieVal } }, res2) === id1);
check("既存Cookieがあれば再発行しない", res2.headers["Set-Cookie"] === undefined);

// 署名を壊したCookieは信用されず、新しいIDが振られる
const res3 = mockRes();
const tampered = cookieVal.split(".")[0] + ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
check("署名が合わないCookieは信用しない",
  u.resolveVisitorId({ headers: {}, cookies: { mad_vid: tampered } }, res3) !== id1);

// 中身（訪問者ID）を差し替えた場合も署名が合わないので拒否される
const res4 = mockRes();
const forgedBody = Buffer.from(JSON.stringify({ v: "someone-elses-id", exp: 9999999999 }), "utf8")
  .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const forged = `${forgedBody}.${cookieVal.split(".")[1]}`;
check("他人の訪問者IDを詐称したCookieは通らない",
  u.resolveVisitorId({ headers: {}, cookies: { mad_vid: forged } }, res4) !== "someone-elses-id");

// =============================================================
console.log("2. 無料枠の上限");
// =============================================================
{
  const who = { visitorId: "visitor-A", ip: "10.0.0.1", pro: false };
  let blockedAt = null;
  for (let i = 1; i <= 8; i++) {
    const q = await u.checkQuota(who);
    if (!q.allowed && q.status === 402) { blockedAt = i; break; }
    await u.consumeFreeQuota(who); // 診断成功とみなして消費
  }
  check(`無料枠は${u.FREE_HARD_LIMIT}回まで通り、次で402になる`, blockedAt === u.FREE_HARD_LIMIT + 1,
    `実際は${blockedAt}回目でブロック`);
}

// =============================================================
console.log("3. 失敗した診断では枠を消費しない");
// =============================================================
{
  const who = { visitorId: "visitor-B", ip: "10.0.0.2", pro: false };
  await u.checkQuota(who);            // 受付だけして
  await u.checkQuota(who);            // 消費せずに終わったケースを2回
  const after = await u.readUsage(who);
  check("checkQuota だけでは残数が減らない", after.used === 0, `used=${after.used}`);
}

// =============================================================
console.log("4. Pro は無料枠の上限を受けない");
// =============================================================
{
  const q = await u.checkQuota({ visitorId: "visitor-A", ip: "10.0.0.3", pro: true });
  check("上限に達した訪問者でも Pro なら通る", q.allowed === true);
}

// =============================================================
console.log("5. IP単位のレート制限");
// =============================================================
{
  const who = { visitorId: null, ip: "10.0.0.9", pro: true }; // pro=true で402を除外し429だけ見る
  let limitedAt = null;
  for (let i = 1; i <= 20; i++) {
    const r = await u.checkQuota(who);
    if (!r.allowed && r.status === 429) { limitedAt = i; break; }
  }
  check("同一IPの連打が429で止まる", limitedAt !== null && limitedAt > 1, `${limitedAt}回目で発動`);
  const other = await u.checkQuota({ visitorId: null, ip: "10.0.0.10", pro: true });
  check("別IPは巻き添えにならない", other.allowed === true);
}

// =============================================================
console.log("6. IPを平文で保存しない");
// =============================================================
{
  const ip = "203.0.113.45";
  const h = u.hashIp(ip);
  check("変換結果にIPそのものが含まれない", !h.includes(ip) && !h.includes("203"));
  check("変換結果は固定長の16進", /^[0-9a-f]{16}$/.test(h), h);
  check("同じIPなら同じ値になる（判定に使える）", u.hashIp(ip) === h);
  check("違うIPなら違う値になる", u.hashIp("203.0.113.46") !== h);
  check("鍵が違えば同じIPでも別の値になる", (() => {
    const before = process.env.APP_TOKEN_SECRET;
    process.env.APP_TOKEN_SECRET = before + "-different";
    const other = u.hashIp(ip);
    process.env.APP_TOKEN_SECRET = before;
    return other !== h;
  })());
  check("IPv6でも扱える", /^[0-9a-f]{16}$/.test(u.hashIp("2001:db8::1")));
}

// =============================================================
console.log("7. ストアのフォールバック");
// =============================================================
check("Upstash未設定ならメモリで動く", u.storeBackend() === "memory");

// =============================================================
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n=== pass ${pass} / fail ${failures.length} ===`);
if (failures.length) {
  console.log("失敗:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
