import { redisRaw, getClientIp, hashIp } from "../../lib/usage";

// 「有料相談に興味がある」ボタンの匿名カウンタ。
// 個人情報は保存しない。IPのハッシュを1日単位の集合に入れて二重押しを避けるだけ。
const TOPICS = new Set(["soudan"]);
const memory = new Map();

export default async function handler(req, res) {
  const topic = String((req.method === "GET" ? req.query.topic : req.body?.topic) || "");
  if (!TOPICS.has(topic)) return res.status(400).json({ error: "unknown topic" });

  if (req.method === "GET") {
    try {
      const n = await redisRaw(["GET", `interest:${topic}`]);
      return res.status(200).json({ topic, count: Number(n ?? memory.get(topic) ?? 0) });
    } catch {
      return res.status(200).json({ topic, count: Number(memory.get(topic) ?? 0) });
    }
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const day = new Date().toISOString().slice(0, 10);
  let who = null;
  try {
    who = hashIp(getClientIp(req) || "");
  } catch {
    who = null; // 秘密鍵が未設定の環境では重複排除をせず、件数だけ数える
  }
  try {
    if (!who) throw new Error("no secret");
    const added = await redisRaw(["SADD", `interest:${topic}:${day}`, who]);
    if (added === null) throw new Error("no redis");
    await redisRaw(["EXPIRE", `interest:${topic}:${day}`, String(60 * 60 * 48)]);
    if (Number(added) === 1) await redisRaw(["INCR", `interest:${topic}`]);
    const n = await redisRaw(["GET", `interest:${topic}`]);
    return res.status(200).json({ ok: true, count: Number(n || 0) });
  } catch {
    memory.set(topic, (memory.get(topic) || 0) + 1);
    return res.status(200).json({ ok: true, count: memory.get(topic), backend: "memory" });
  }
}
