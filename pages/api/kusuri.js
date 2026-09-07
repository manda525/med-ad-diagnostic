// 薬のリスト整理API — サーバー側でプロンプトを構築し、構造化出力で返す。
// 利用枠・レート制限・個人プランの判定は診断API（diagnose.js）と同じ仕組みを使う。

import { verifyToken } from "../../lib/entitlement";
import { getStripe } from "../../lib/stripe";
import { KUSURI_SCHEMA, KUSURI_SYSTEM, buildKusuriPrompt } from "../../lib/kusuri";
import { reserveQuota, releaseQuota, getClientIp, resolveVisitorId, isSecretConfigured } from "../../lib/usage";

export const config = { maxDuration: 300 };

const MODEL = process.env.DIAGNOSE_MODEL || "claude-fable-5";
const EFFORT = process.env.DIAGNOSE_EFFORT || "medium";
const REQUEST_BUDGET_MS = 280_000;
const AGES = new Set(["子ども", "成人", "65歳以上", "妊娠中・授乳中", "混在"]);
const VISITS = new Set(["毎月通院している", "ときどき受診する", "ほとんど受診しない"]);

async function isProRequest(req) {
  const payload = verifyToken(req.headers["x-entitlement-token"]);
  if (!payload || !payload.s) return false;
  try {
    const sub = await getStripe().subscriptions.retrieve(payload.s);
    return !!sub && (sub.status === "active" || sub.status === "trialing");
  } catch (e) {
    console.error("subscription check failed:", e.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isSecretConfigured()) {
    return res.status(503).json({ error: "サーバー設定が未完了のため、現在ご利用いただけません。" });
  }
  const pro = await isProRequest(req);
  res.setHeader("x-pro", pro ? "1" : "0");
  const ip = getClientIp(req);
  const visitorId = resolveVisitorId(req, res);

  const quota = await reserveQuota({ visitorId, ip, pro });
  if (!quota.allowed) {
    return res.status(quota.status).json({ error: quota.error, requireUpgrade: quota.requireUpgrade, usage: { ...quota.usage, pro } });
  }
  const reservation = quota.reservation;
  const failWith = async (status, payload) => {
    await releaseQuota(reservation);
    return res.status(status).json(payload);
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return failWith(500, { error: "ANTHROPIC_API_KEY が設定されていません。" });

  const { text, age, visit, note } = req.body || {};
  if (!text || !String(text).trim()) return failWith(400, { error: "薬のリストが空です。" });
  if (String(text).length > 3000) return failWith(400, { error: "リストが長すぎます（3,000文字まで）。家族ごとに分けてお試しください。" });

  const user = buildKusuriPrompt(String(text), {
    age: AGES.has(age) ? age : "",
    visit: VISITS.has(visit) ? visit : "",
    note: typeof note === "string" ? note : "",
  });

  try {
    const headers = { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    const body = {
      model: MODEL,
      max_tokens: 6000,
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: KUSURI_SCHEMA } },
      system: KUSURI_SYSTEM,
      messages: [{ role: "user", content: user }],
    };
    if (MODEL === "claude-fable-5" || MODEL === "claude-mythos-5") {
      body.fallbacks = [{ model: "claude-opus-4-8" }];
      headers["anthropic-beta"] = "server-side-fallback-2026-06-01";
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_BUDGET_MS);
    let response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const data = await response.json();
    if (!response.ok) {
      console.error("anthropic error:", JSON.stringify(data).slice(0, 500));
      return failWith(response.status, { error: data?.error?.message || "AI整理でエラーが発生しました。" });
    }
    if (data.stop_reason === "refusal") {
      return failWith(422, { error: "この内容はAIによる自動整理の対象外と判定されました。かかりつけ薬局にご相談ください。" });
    }
    const raw = (data.content || []).find((c) => c.type === "text")?.text || "";
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      return failWith(502, { error: "AI応答の解析に失敗しました。もう一度お試しください。" });
    }
    return res.status(200).json({ result, usage: { ...quota.usage, pro }, engine: { model: data.model || MODEL } });
  } catch (error) {
    if (error?.name === "AbortError") return failWith(504, { error: "整理に時間がかかりすぎたため中断しました。リストを短くしてお試しください。" });
    console.error("kusuri failed:", error);
    return failWith(500, { error: error.message });
  }
}
