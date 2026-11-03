// 監修依頼の保存先。
//
// 利用枠のカウンタ（lib/usage.js）と違い、依頼は「支払いが済んだ事実」を持つ。
// インスタンスごとに消えるメモリへ黙って退避すると、支払い済みの依頼が消える。
// そのため Upstash が使えないときは available() が false を返し、呼び出し側が受付を止める。
// メモリ保存は Vercel 上（VERCEL_ENV あり）では使わない。ローカル開発とテストだけで使う。
//
// 保存するのは依頼ID・状態・金額・文字数・業種/媒体のラベル・AI判定だけ。
// 原稿の本文とメールアドレスは持たない（原稿はお客様がメールで送る。連絡先は Stripe 側にある）。

import { redisConfigured, redisCommand } from "./usage";

const KEY_PREFIX = "mad:sup:req:";
const INDEX_KEY = "mad:sup:idx";
const INDEX_KEEP = 2000;

const DAY = 60 * 60 * 24;
// 支払い前の依頼は、Checkout の有効期限（24時間）を過ぎれば用済みなので短く持つ。
export const TTL_UNPAID_SEC = 3 * DAY;
// 支払い後の依頼は、問い合わせ・返金・納品の確認に使うので長く持つ。
export const TTL_PAID_SEC = 400 * DAY;

export function ttlFor(record) {
  return record && record.status === "awaiting_payment" ? TTL_UNPAID_SEC : TTL_PAID_SEC;
}

const CAS_RETRIES = 4;

// 値が変わっていないときだけ書き込む（比較して書く）。
const CAS_LUA = `
local cur = redis.call('GET', KEYS[1])
if cur == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0
`;

// 回数制限：加算・上限判定・超過時の巻き戻しを不可分に行う（lib/usage.js と同じ型）。
const HIT_LUA = `
local v = redis.call('INCR', KEYS[1])
if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if v > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return 1
`;

function memoryAllowed() {
  return !process.env.VERCEL_ENV;
}

function redisBackedStore() {
  const recordKey = (id) => KEY_PREFIX + id;
  return {
    backend: "redis",
    available: () => true,

    async get(id) {
      const raw = await redisCommand(["GET", recordKey(id)]);
      return raw ? JSON.parse(raw) : null;
    },

    async create(record) {
      const ok = await redisCommand(["SET", recordKey(record.id), JSON.stringify(record), "EX", String(ttlFor(record)), "NX"]);
      if (ok !== "OK") return false;
      try {
        await redisCommand(["ZADD", INDEX_KEY, String(Date.parse(record.createdAt) || Date.now()), record.id]);
        await redisCommand(["ZREMRANGEBYRANK", INDEX_KEY, "0", String(-(INDEX_KEEP + 1))]);
      } catch (e) {
        // 一覧用の索引が書けなくても、依頼自体は成立している
        console.error("supervise index write failed:", e.message);
      }
      return true;
    },

    // fn(record) が返した record で書き換える。返り値が同じ内容なら書かない。
    // 読んでから書くまでに他のリクエストが書いていたら、読み直してやり直す。
    async update(id, fn) {
      for (let i = 0; i < CAS_RETRIES; i++) {
        const raw = await redisCommand(["GET", recordKey(id)]);
        if (!raw) return null;
        const next = fn(JSON.parse(raw));
        const nextRaw = JSON.stringify(next);
        if (nextRaw === raw) return next;
        const ok = await redisCommand(["EVAL", CAS_LUA, "1", recordKey(id), raw, nextRaw, String(ttlFor(next))]);
        if (Number(ok) === 1) return next;
      }
      throw new Error("supervise record update conflicted too many times");
    },

    async remove(id) {
      await redisCommand(["DEL", recordKey(id)]);
      try { await redisCommand(["ZREM", INDEX_KEY, id]); } catch { /* 索引は後で自然に落ちる */ }
    },

    async list(limit = 50) {
      const ids = await redisCommand(["ZREVRANGE", INDEX_KEY, "0", String(Math.max(0, limit - 1))]);
      if (!Array.isArray(ids) || ids.length === 0) return [];
      const raws = await redisCommand(["MGET", ...ids.map(recordKey)]);
      return (raws || []).filter(Boolean).map((r) => JSON.parse(r));
    },

    async hit(key, limit, ttlSec) {
      const r = await redisCommand(["EVAL", HIT_LUA, "1", key, String(limit), String(ttlSec)]);
      return Number(r) === 1;
    },
  };
}

// ローカル開発とテスト用。インスタンスをまたいで共有されない。
export function createMemoryStore() {
  const records = new Map(); // id -> { raw, expiresAt }
  const counters = new Map(); // key -> { n, expiresAt }
  const live = (e) => e && e.expiresAt > Date.now();
  return {
    backend: "memory",
    available: () => true,

    async get(id) {
      const e = records.get(id);
      return live(e) ? JSON.parse(e.raw) : null;
    },

    async create(record) {
      if (live(records.get(record.id))) return false;
      records.set(record.id, { raw: JSON.stringify(record), expiresAt: Date.now() + ttlFor(record) * 1000 });
      return true;
    },

    // await を挟まないので、同じプロセス内では読み書きが割り込まれない
    async update(id, fn) {
      const e = records.get(id);
      if (!live(e)) return null;
      const next = fn(JSON.parse(e.raw));
      records.set(id, { raw: JSON.stringify(next), expiresAt: Date.now() + ttlFor(next) * 1000 });
      return next;
    },

    async remove(id) {
      records.delete(id);
    },

    async list(limit = 50) {
      return [...records.values()]
        .filter(live)
        .map((e) => JSON.parse(e.raw))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .slice(0, limit);
    },

    async hit(key, limit, ttlSec) {
      const c = counters.get(key);
      const n = live(c) ? c.n + 1 : 1;
      if (n > limit) return false;
      counters.set(key, { n, expiresAt: live(c) ? c.expiresAt : Date.now() + ttlSec * 1000 });
      return true;
    },
  };
}

const unavailableStore = {
  backend: "none",
  available: () => false,
};

// ローカル開発では API ルートごとにモジュールが別々に読み込まれることがあるため、
// メモリ保存の実体は globalThis に1つだけ置く（ルート間で依頼が見えなくなるのを防ぐ）。
const MEMORY_SLOT = "__madSuperviseMemoryStore";

// 使える保存先を返す。Upstash があればそれ。無ければ、ローカルのときだけメモリ。
// どちらも無いときは available() が false のストアを返す（受付を止める合図）。
export function getStore() {
  if (redisConfigured()) return redisBackedStore();
  if (memoryAllowed()) {
    if (!globalThis[MEMORY_SLOT]) globalThis[MEMORY_SLOT] = createMemoryStore();
    return globalThis[MEMORY_SLOT];
  }
  return unavailableStore;
}
