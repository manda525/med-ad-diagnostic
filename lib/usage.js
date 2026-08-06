// サーバー側の利用計上とレート制限
//
// 無料枠の回数はクライアントの申告（旧 x-usage-count ヘッダ）を信用せず、
// サーバーが署名付き Cookie の訪問者IDに紐づけて数える。
// あわせて IP 単位の制限を重ね、無認証の公開エンドポイントが
// 高単価モデルの財布へ直結している状態を塞ぐ。
//
// 枠は「AI を呼ぶ前に予約し、失敗したら戻す」方式。確認してから加算する方式だと、
// 同時に投げられた複数のリクエストが全部「まだ上限未満」と判定されて通り抜ける。
// 予約の加算と上限判定は Lua スクリプトで 1 往復にまとめ、不可分に実行する。
//
// ストアは Upstash Redis REST。未設定・障害時はプロセス内メモリへフォールバックする。
// メモリ側はインスタンスごとに独立するため厳密ではないが、無制限よりは必ず狭い。

import crypto from "crypto";
import { signToken, verifyToken } from "./entitlement";

// 訪問者あたりの無料診断回数
export const FREE_HARD_LIMIT = 6;

// IP 単位：10分あたりの上限（連打の抑止）
const IP_WINDOW_SEC = 600;
const IP_MAX_IN_WINDOW = 12;

// IP 単位：1日あたりの無料診断の上限。
// Cookie を保持しないクライアントは毎回新しい訪問者IDになり、訪問者単位の
// 6回制限が効かない。その穴を塞ぐための別軸の上限。
const IP_DAY_TTL_SEC = 60 * 60 * 24;
const IP_DAY_LIMIT = 12;

const VISITOR_COOKIE = "mad_vid";
const VISITOR_TTL_SEC = 60 * 60 * 24 * 365;
// 訪問者あたりの利用回数の保持期間。無料枠は事実上1年で復活する。
const USAGE_TTL_SEC = VISITOR_TTL_SEC;

// ---- 秘密鍵 ----------------------------------------------------------------

// APP_TOKEN_SECRET は Cookie の署名と IP の変換に使う。
// 未設定のまま既定値へフォールバックすると、署名も IP の秘匿も意味を失うため、
// 呼び出し側が起動時に検査して停止できるようにしておく。
export function isSecretConfigured() {
  return !!process.env.APP_TOKEN_SECRET;
}

// ---- ストア ----------------------------------------------------------------

const mem = new Map(); // key -> { value: number, expiresAt: number(ms) }

function memPrune() {
  if (mem.size <= 5000) return;
  const now = Date.now();
  for (const [k, v] of mem) if (v.expiresAt && v.expiresAt < now) mem.delete(k);
}

function memGet(key) {
  const hit = mem.get(key);
  if (!hit) return 0;
  if (hit.expiresAt && hit.expiresAt < Date.now()) {
    mem.delete(key);
    return 0;
  }
  return hit.value;
}

function memSet(key, value, ttlSec) {
  mem.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  memPrune();
}

function memIncr(key, ttlSec) {
  const next = memGet(key) + 1;
  memSet(key, next, ttlSec);
  return next;
}

function memDecr(key, ttlSec) {
  const current = memGet(key);
  if (current <= 0) return 0;
  const next = current - 1;
  memSet(key, next, ttlSec);
  return next;
}

// 変数名は作り方で変わる。Upstashで直接作れば UPSTASH_REDIS_REST_URL、
// VercelのUpstash連携で作ると接頭辞の後ろに KV_REST_API_URL が付く。
// どちらでも動くよう候補を順に見る。
const REST_URL_VARS = [
  "UPSTASH_REDIS_REST_URL",              // Upstashで直接作成した場合
  "UPSTASH_REDIS_REST_KV_REST_API_URL",  // Vercel連携（接頭辞 UPSTASH_REDIS_REST）
  "KV_REST_API_URL",                     // Vercel連携（接頭辞なし）
];
const REST_TOKEN_VARS = [
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_KV_REST_API_TOKEN",
  "KV_REST_API_TOKEN",
];

function pickEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return null;
}

function redisConfig() {
  const url = pickEnv(REST_URL_VARS);
  const token = pickEnv(REST_TOKEN_VARS);
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

function redisConfigured() {
  return !!redisConfig();
}

async function redisCommand(command) {
  const { url, token } = redisConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`upstash responded ${res.status}`);
  const data = await res.json();
  if (data && data.error) throw new Error(`upstash error: ${data.error}`);
  return data.result;
}

// ---- 原子的な予約 ----------------------------------------------------------
//
// 加算・上限判定・超過時の巻き戻しを 1 スクリプトにまとめる。
// 途中に他のリクエストが割り込めないため、同時到着しても上限を超えない。
const RESERVE_LUA = `
local v = redis.call('INCR', KEYS[1])
if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if v > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return {0, v - 1}
end
return {1, v}
`;

// 0 未満へ落とさない巻き戻し
const RELEASE_LUA = `
local v = tonumber(redis.call('GET', KEYS[1]) or '0')
if v > 0 then return redis.call('DECR', KEYS[1]) end
return 0
`;

// 枠を1つ予約する。戻り値 { ok, used }。ok=false のとき used は予約前の値。
async function reserveSlot(key, limit, ttlSec) {
  if (redisConfigured()) {
    try {
      const result = await redisCommand(["EVAL", RESERVE_LUA, "1", key, String(limit), String(ttlSec)]);
      return { ok: Number(result[0]) === 1, used: Number(result[1]) };
    } catch (e) {
      console.error("usage store reserve failed, falling back to memory:", e.message);
    }
  }
  // メモリ側も加算と判定の間に await を挟まないことで不可分にする
  const used = memIncr(key, ttlSec);
  if (used > limit) {
    memDecr(key, ttlSec);
    return { ok: false, used: used - 1 };
  }
  return { ok: true, used };
}

async function releaseSlot(key, ttlSec) {
  if (redisConfigured()) {
    try {
      await redisCommand(["EVAL", RELEASE_LUA, "1", key]);
      return;
    } catch (e) {
      console.error("usage store release failed, falling back to memory:", e.message);
    }
  }
  memDecr(key, ttlSec);
}

async function storeGet(key) {
  if (redisConfigured()) {
    try {
      const value = await redisCommand(["GET", key]);
      return parseInt(value || "0", 10) || 0;
    } catch (e) {
      console.error("usage store GET failed, falling back to memory:", e.message);
    }
  }
  return memGet(key);
}

// ---- 訪問者ID（署名付き Cookie） -------------------------------------------

function parseCookie(req, name) {
  if (req.cookies && req.cookies[name]) return req.cookies[name];
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// IPはそのままの形で保存しない。APP_TOKEN_SECRET を鍵にしたHMACに変換してから使う。
// 鍵なしの単純なハッシュだと、IPv4は全空間を総当たりできて元に戻せてしまうため。
// 変換結果はプロセス間で同一になるので、レート制限・利用計上の判定には支障がない。
export function hashIp(ip) {
  const secret = process.env.APP_TOKEN_SECRET;
  if (!secret) throw new Error("APP_TOKEN_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(String(ip)).digest("hex").slice(0, 16);
}

// 既存の訪問者IDを返す。無ければ発行して Set-Cookie する。
// APP_TOKEN_SECRET 未設定などで署名できない場合は null（IPのみで判定に落ちる）。
export function resolveVisitorId(req, res) {
  const existing = parseCookie(req, VISITOR_COOKIE);
  if (existing) {
    const payload = verifyToken(existing);
    if (payload && payload.v) return payload.v;
  }
  let token;
  const id = crypto.randomUUID();
  try {
    token = signToken({ v: id, exp: Math.floor(Date.now() / 1000) + VISITOR_TTL_SEC });
  } catch (e) {
    console.error("visitor cookie could not be signed:", e.message);
    return null;
  }
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${VISITOR_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${VISITOR_TTL_SEC}; HttpOnly; SameSite=Lax${secure}`
  );
  return id;
}

// ---- キー ------------------------------------------------------------------

function visitorKey(visitorId, ip) {
  return visitorId ? `mad:use:v:${visitorId}` : `mad:use:ip:${hashIp(ip)}`;
}

function ipDayKey(ip) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `mad:day:${hashIp(ip)}:${day}`;
}

function ipBurstKey(ip) {
  const bucket = Math.floor(Date.now() / 1000 / IP_WINDOW_SEC);
  return `mad:rl:${hashIp(ip)}:${bucket}`;
}

// ---- 判定 ------------------------------------------------------------------

// 現在の利用状況を返す（予約しない）。
export async function readUsage({ visitorId, ip }) {
  const used = await storeGet(visitorKey(visitorId, ip));
  return { used, limit: FREE_HARD_LIMIT, remaining: Math.max(0, FREE_HARD_LIMIT - used) };
}

// AI を呼ぶ前に枠を予約する。
// 戻り値の reservation を、失敗時に releaseQuota() へ渡して戻す。
export async function reserveQuota({ visitorId, ip, pro }) {
  // 連打の抑止はProも含めて先に通す（戻さない。連打自体を数える目的のため）
  const burst = await reserveSlot(ipBurstKey(ip), IP_MAX_IN_WINDOW, IP_WINDOW_SEC);
  if (!burst.ok) {
    return {
      allowed: false,
      status: 429,
      error: "短時間に多くのリクエストが集中しています。しばらく置いてからお試しください。",
      usage: await readUsage({ visitorId, ip }),
    };
  }

  if (pro) {
    return { allowed: true, usage: await readUsage({ visitorId, ip }), reservation: null };
  }

  // 訪問者単位の無料枠
  const vKey = visitorKey(visitorId, ip);
  const visitor = await reserveSlot(vKey, FREE_HARD_LIMIT, USAGE_TTL_SEC);
  if (!visitor.ok) {
    return {
      allowed: false,
      status: 402,
      error: "無料診断の上限に達しました。プランにご登録ください。",
      requireUpgrade: true,
      usage: { used: visitor.used, limit: FREE_HARD_LIMIT, remaining: 0 },
    };
  }

  // IP単位の1日上限（Cookieを保持しないクライアント対策）
  const dKey = ipDayKey(ip);
  const day = await reserveSlot(dKey, IP_DAY_LIMIT, IP_DAY_TTL_SEC);
  if (!day.ok) {
    await releaseSlot(vKey, USAGE_TTL_SEC); // 訪問者側の予約は戻す
    return {
      allowed: false,
      status: 429,
      error: "本日の無料診断の上限に達しました。時間をおいてお試しください。",
      usage: { used: visitor.used - 1, limit: FREE_HARD_LIMIT, remaining: Math.max(0, FREE_HARD_LIMIT - visitor.used + 1) },
    };
  }

  return {
    allowed: true,
    usage: { used: visitor.used, limit: FREE_HARD_LIMIT, remaining: Math.max(0, FREE_HARD_LIMIT - visitor.used) },
    reservation: { visitorKey: vKey, dayKey: dKey },
  };
}

// 診断が失敗したときに予約を戻す。
export async function releaseQuota(reservation) {
  if (!reservation) return;
  await releaseSlot(reservation.visitorKey, USAGE_TTL_SEC);
  await releaseSlot(reservation.dayKey, IP_DAY_TTL_SEC);
}

export function storeBackend() {
  return redisConfigured() ? "redis" : "memory";
}

export const LIMITS = {
  freePerVisitor: FREE_HARD_LIMIT,
  freePerIpPerDay: IP_DAY_LIMIT,
  burstPerIpPerWindow: IP_MAX_IN_WINDOW,
  burstWindowSec: IP_WINDOW_SEC,
};
