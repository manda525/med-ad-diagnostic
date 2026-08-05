// v2 診断API — サーバー側でプロンプトを構築し claude-fable-5 で判定する
// - クライアントは {text, industry, sub, media, clientIndustry, clientSub} のみ送信（プロンプト・モデルはサーバーが所有）
// - Fable 5: thinking常時オン（パラメータ送信不可）・server-side fallbacks で refusal 時は opus-4-8 に自動退避
// - 構造化出力 output_config.format で JSON を保証（クライアント側の堅牢パーサ不要に）
// - 無料枠の回数はサーバー側で計上する。クライアントの申告値は使わない

import { verifyToken } from "../../lib/entitlement";
import { getStripe } from "../../lib/stripe";
import { buildPrompt, OUTPUT_SCHEMA, RULE_VER, RULE_COUNT } from "../../lib/engine";
import {
  checkQuota,
  consumeFreeQuota,
  getClientIp,
  resolveVisitorId,
} from "../../lib/usage";

export const config = { maxDuration: 60 };

const MODEL = process.env.DIAGNOSE_MODEL || "claude-fable-5";
const EFFORT = process.env.DIAGNOSE_EFFORT || "medium";

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pro = await isProRequest(req);
  res.setHeader("x-pro", pro ? "1" : "0");

  const ip = getClientIp(req);
  const visitorId = resolveVisitorId(req, res);

  const quota = await checkQuota({ visitorId, ip, pro });
  if (!quota.allowed) {
    return res.status(quota.status).json({
      error: quota.error,
      requireUpgrade: quota.requireUpgrade,
      usage: { ...quota.usage, pro },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY が設定されていません。" });
  }

  const { text, industry, sub, media, clientIndustry, clientSub } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: "広告文が空です。" });
  }
  if (String(text).length > 8000) {
    return res.status(400).json({ error: "広告文が長すぎます（8,000文字まで）。分割してお試しください。" });
  }

  const { system, user, matched, laws } = buildPrompt(String(text), {
    industryId: industry || "E",
    subId: sub || null,
    mediaId: media || null,
    clientIndustryId: clientIndustry || null,
    clientSubId: clientSub || null,
  });

  try {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
    const body = {
      model: MODEL,
      max_tokens: 8000,
      // Fable 5 は thinking 常時オン（パラメータ省略）
      output_config: {
        effort: EFFORT,
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      system,
      messages: [{ role: "user", content: user }],
    };
    // server-side fallbacks は Fable 5 系だけが受け付ける。他のモデルに付けると400になるため、
    // DIAGNOSE_MODEL を切り替えたときに壊れないよう対象モデルのときだけ付ける。
    if (MODEL === "claude-fable-5" || MODEL === "claude-mythos-5") {
      // refusal 時は opus-4-8 が同一リクエスト内で引き継ぐ
      body.fallbacks = [{ model: "claude-opus-4-8" }];
      headers["anthropic-beta"] = "server-side-fallback-2026-06-01";
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("anthropic error:", JSON.stringify(data).slice(0, 500));
      return res.status(response.status).json({ error: data?.error?.message || "AI診断でエラーが発生しました。" });
    }

    // refusal（フォールバック含め全滅）チェック — content を読む前に必ず判定
    if (data.stop_reason === "refusal") {
      return res.status(422).json({
        error: "この内容はAIによる自動診断の対象外と判定されました。監修相談をご利用ください。",
      });
    }

    const raw = (data.content || []).find((c) => c.type === "text")?.text || "";
    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: "AI応答の解析に失敗しました。もう一度お試しください。" });
    }

    // 成功したときだけ無料枠を消費する（API障害で回数を失わせない）
    const usage = pro ? quota.usage : await consumeFreeQuota({ visitorId, ip });

    return res.status(200).json({
      analysis,
      matches: matched.slice(0, 30).map((m) => ({
        id: m.id, ng: m.ng, risk: m.risk, genre: m.genre,
        comment: m.comment, ok: m.ok, law_ids: m.law_ids, jcia: m.jcia, src: m.src,
      })),
      matchCount: matched.length,
      laws: laws.map((l) => ({ id: l.id, title: l.title, article: l.article, source_urls: l.source_urls })),
      usage: { ...usage, pro },
      engine: {
        model: data.model || MODEL,
        rulebook: `${RULE_VER}/${RULE_COUNT}`,
        fallback: (data.usage?.iterations || []).some((i) => i.type === "fallback_message") || undefined,
      },
    });
  } catch (error) {
    console.error("diagnose failed:", error);
    return res.status(500).json({ error: error.message });
  }
}
