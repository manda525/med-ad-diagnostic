// サーバー側の利用計上とレート制限（RFC-001 B-1 / F-1）
//
// 無料枠の回数はクライアントの申告（旧 x-usage-count ヘッダ）を信用せず、
// サーバーが署名付き Cookie の訪問者IDに紐づけて数える。
// あわせて IP 単位のレート制限を重ね、無認証の公開エンドポイントが
// 高単価モデルの財布へ直結している状態を塞ぐ。
//
// ストアは Upstash Redis REST（UPSTASH_REDIS_REST_URL / _TOKEN）。
// 未設定・障害時はプロセス内メモリへフォールバックする。メモリ側は
// インスタンスごとに独立するため厳密ではないが、無制限よりは必ず狭い。

import crypto from "crypto";
import { signToken, verifyToken } from "./entitlement";

export const FREE_HARD_LIMIT = 6;

// IP 単位：10分あたりの上限。無料枠を使い切った後の連打も含めて数える。
const IP_WINDOW_SEC = 600;
const IP_MAX_IN_WINDOW = 12;

const VISITOR_COOKIE = "mad_vid";
const VISITOR_TTL_SEC = 60 * 60 * 24 * 365;
// 訪問者あたりの利用回数の保持期間。無料枠は事実上1年で復活する。
const USAGE_TTL_SEC = VISITOR_TTL_SEC;

// ---- ストア ----------------------------------------------------------------

const mem = new Map(); // key -> { value: number, expiresAt: number(ms) }

function memGet(key) {
  const hit = mem.get(key);
  if (!hit) return 0;
  if (hit.expiresAt && hit.expiresAt < Date.now()) {
    mem.delete(key);
    return 0;
  }
  return hit.value;
}

function memIncr(key, ttlSec) {
  const current = memGet(key);
  const next = current + 1;
  mem.set(key, { value: next, expiresAt: Date.now() + ttlSec * 1000 });
  // 際限なく増えないよう、期限切れを都度いくらか掃除する
  if (mem.size > 5000) {
    const now = Date.now();
    for (const [k, v] of mem) if (v.expiresAt && v.expiresAt < now) mem.delete(k);
  }
  return next;
}

function redisConfigured() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisPipeline(commands) {
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, "");
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`upstash responded ${res.status}`);
  const data = await res.json();
  return data.map((entry) => entry.result);
}

async function storeGet(key) {
  if (redisConfigured()) {
    try {
      const [value] = await redisPipeline([["GET", key]]);
      return parseInt(value || "0", 10) || 0;
    } catch (e) {
      console.error("usage store GET failed, falling back to memory:", e.message);
    }
  }
  return memGet(key);
}

async function storeIncr(key, ttlSec) {
  if (redisConfigured()) {
    try {
      const [value] = await redisPipeline([
        ["INCR", key],
        ["EXPIRE", key, String(ttlSec)],
      ]);
      return parseInt(value, 10) || 1;
    } catch (e) {
      console.error("usage store INCR failed, falling back to memory:", e.message);
    }
  }
  return memIncr(key, ttlSec);
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

// ---- 判定 ------------------------------------------------------------------

function usageKey(visitorId, ip) {
  return visitorId ? `mad:use:v:${visitorId}` : `mad:use:ip:${ip}`;
}

// 現在の利用状況を返す（消費しない）。
export async function readUsage({ visitorId, ip }) {
  const used = await storeGet(usageKey(visitorId, ip));
  return { used, limit: FREE_HARD_LIMIT, remaining: Math.max(0, FREE_HARD_LIMIT - used) };
}

// リクエストを受け付けてよいか判定する。IPレート制限はここで必ず1つ消費する
// （診断が失敗しても連打自体は抑止したいため）。無料枠の消費は成功後に
// consumeFreeQuota() で行う。
export async function checkQuota({ visitorId, ip, pro }) {
  const bucket = Math.floor(Date.now() / 1000 / IP_WINDOW_SEC);
  const hits = await storeIncr(`mad:rl:${ip}:${bucket}`, IP_WINDOW_SEC);
  if (hits > IP_MAX_IN_WINDOW) {
    return {
      allowed: false,
      status: 429,
      error: "短時間に多くのリクエストが集中しています。しばらく置いてからお試しください。",
      usage: await readUsage({ visitorId, ip }),
    };
  }

  const usage = await readUsage({ visitorId, ip });
  if (pro) return { allowed: true, usage };

  if (usage.used >= FREE_HARD_LIMIT) {
    return {
      allowed: false,
      status: 402,
      error: "無料診断の上限に達しました。プランにご登録ください。",
      requireUpgrade: true,
      usage,
    };
  }
  return { allowed: true, usage };
}

// 診断が成功したときだけ無料枠を1つ消費する。
export async function consumeFreeQuota({ visitorId, ip }) {
  const used = await storeIncr(usageKey(visitorId, ip), USAGE_TTL_SEC);
  return { used, limit: FREE_HARD_LIMIT, remaining: Math.max(0, FREE_HARD_LIMIT - used) };
}

export function storeBackend() {
  return redisConfigured() ? "redis" : "memory";
}
