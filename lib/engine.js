// v2 診断エンジン（サーバー側）
// 業種×媒体で法令ノード＋ルールをフィルタし、Fable 5 用のプロンプトを構築する。

import lawMaster from "../data/law_master.json";
import rulebook from "../data/rulebook_v2.json";
import { INDUSTRIES, MEDIA, industryById, mediaById, lawApplies, ruleApplies } from "./taxonomy";

export const RULE_COUNT = rulebook.rules.length;
export const RULE_VER = rulebook.meta?.version || "v15";
export const LAW_COUNT = lawMaster.laws.length;

// ---- ルールマッチング（旧 matchRules の改良版・上位10件足切り廃止） ----
export function matchRules(text, industryId, subId) {
  const norm = String(text).toLowerCase().replace(/[　\s]/g, "");
  const matched = [];
  for (const rule of rulebook.rules) {
    if (!ruleApplies(rule, industryId, subId)) continue;

    // 照合語が明示指定されているルールは、NG表現からの自動導出を使わない。
    // 正本のNG表現は法令の解説文であって照合用の語彙ではないため、自動導出が
    // 破綻するルールを data/match_overrides.json で救う。1文字の語もここでは有効。
    if (Array.isArray(rule.match) && rule.match.length > 0) {
      const hit = rule.match.some((t) => {
        const term = String(t).replace(/[　\s]/g, "").toLowerCase();
        return term && norm.includes(term);
      });
      if (hit) matched.push({ ...rule, matchType: "direct" });
      continue;
    }

    const raw = (rule.ng || "").replace(/[　\s×△○＊]+/g, "").trim();
    if (!raw || raw.length < 2) continue;
    // 「痩せる／必ず痩せる／運動なしで痩せる」のように ／・/ で区切られた
    // 複数表現は、いずれか1つでも一致すればヒット扱いにする。
    const alts = raw.split(/[／\/・]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
    let matchType = null;
    for (const ng of alts) {
      // 末尾の補足（例「確実に（整体痩身）」）は照合対象から外す
      const core = ng.replace(/[（(].*?[）)]/g, "").trim();
      if (core.length < 2) continue;
      const normNg = core.toLowerCase();
      const words = core.split(/[、。，,\s]+/).filter((w) => w.length >= 2);
      const direct = core.length <= 14 && norm.includes(normNg);
      const keyword = core.length >= 3 && core.length <= 7 && norm.includes(normNg);
      const phrase =
        words.length >= 2 &&
        words.filter((w) => norm.includes(w.toLowerCase())).length >= Math.min(2, words.length);
      if (direct) { matchType = "direct"; break; }
      if (keyword) matchType = matchType || "keyword";
      else if (phrase) matchType = matchType || "phrase";
    }
    if (matchType) matched.push({ ...rule, matchType });
  }
  // direct > keyword > phrase、リスク降順
  const w = { direct: 2, keyword: 1, phrase: 0 };
  return matched.sort((a, b) => w[b.matchType] - w[a.matchType] || b.risk - a.risk);
}

// ---- 業種×媒体に適用される法令ノード ----
export function lawsFor(industryId, subId, mediaId) {
  return lawMaster.laws.filter((l) => lawApplies(l, industryId, subId, mediaId));
}

// ---- プロンプト構築 ----
export function buildPrompt(text, { industryId, subId, mediaId, clientIndustryId, clientSubId }) {
  // F（広告・制作）は受託先業種の規制を継承する
  const effIndustry = industryId === "F" && clientIndustryId ? clientIndustryId : industryId;
  const effSub = industryId === "F" && clientIndustryId ? clientSubId : subId;

  const ind = industryById(effIndustry);
  const sub = ind?.subs.find((s) => s.id === effSub);
  const med = mediaById(mediaId);

  const laws = lawsFor(effIndustry, effSub, mediaId);
  // F選択時はステマ・アフィリ責任も必ず含める
  if (industryId === "F") {
    for (const id of ["L-STEMA", "L-AFFILI", "L-YAKKI-66"]) {
      if (!laws.some((l) => l.id === id)) {
        const n = lawMaster.laws.find((l) => l.id === id);
        if (n) laws.push(n);
      }
    }
  }

  const matched = matchRules(text, effIndustry, effSub);
  const MAX_RULES_IN_PROMPT = 40;
  const rulesCtx = matched.slice(0, MAX_RULES_IN_PROMPT).map((r) =>
    `- [${r.id}|risk${r.risk}|${r.law_ids.join("/")}] NG「${r.ng.slice(0, 40)}」→ ${(r.comment || "").slice(0, 60)}${r.ok ? ` / OK例:${r.ok.slice(0, 40)}` : ""}`
  ).join("\n");

  const lawsCtx = laws.map((l) =>
    `### ${l.id} ${l.title}（${l.article}／${l.authority}）\n${l.summary}\n判定要点:\n${l.key_points.map((k) => `- ${k}`).join("\n")}`
  ).join("\n\n");

  const system = `あなたは薬剤師・薬機法管理者・景表法第1級・コスメ薬機法管理者の資格を持つ広告コンプライアンス専門家。以下の【適用法令データベース】は一次ソース（省庁・e-Gov・公正取引協議会）から構築された正確な法令情報である。判定は必ずこのデータベースの条文・判定要点に根拠づけて行うこと。

【クライアント業種】${ind?.label || "不明"}${sub ? `（${sub.label}）` : ""}${industryId === "F" ? "※広告・制作業として受託。受託先業種の規制を継承し、加えてステマ規制・表示主体責任を確認する" : ""}
【広告媒体】${med ? `${med.label} — ${med.note}` : "指定なし"}

【適用法令データベース】
${lawsCtx}

【判定の原則】
- 各指摘には必ず law_id（上記データベースのID）と条文名を紐づける
- 断定的な効能効果・保証・最大級・比較優良・体験談・ビフォーアフターは業種別の可否基準で判定する
- 媒体特性（広告該当性・限定解除・ステマ・法定表示）を判定に織り込む
- 修正案は「言い換えれば適法に伝わる」実務的な代替表現を提示する（単なる削除提案で終わらせない）
- リスク区分: HIGH=行政指導・措置命令リスクが現実的 / MEDIUM=指摘リスクあり要修正 / LOW=注意喚起

【最終判定】は "修正必須" | "要修正" | "軽微修正" | "問題なし" の4段階。`;

  const user = `以下の広告文を診断してください。

【広告文】
${text}

【ルールブック照合結果】（${matched.length}件マッチ${matched.length > MAX_RULES_IN_PROMPT ? `・上位${MAX_RULES_IN_PROMPT}件を表示` : ""}）
${rulesCtx || "直接マッチなし（法令データベースに基づき判定すること）"}`;

  return { system, user, matched, laws, effIndustry, effSub };
}

// ---- 構造化出力スキーマ ----
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    overall_risk: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    risk_score: { type: "integer" },
    summary: { type: "string", description: "総評 1-3文" },
    media_notes: { type: "string", description: "選択媒体に特有の注意（広告該当性・限定解除・ステマ・法定表示等）。特になければ空文字" },
    risk_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          expression: { type: "string", description: "問題のある表現（原文からの抜粋）" },
          reason: { type: "string" },
          law_id: { type: "string", description: "法令データベースのID（例 L-YAKKI-66）" },
          law: { type: "string", description: "条文名（例 薬機法第66条）" },
          level: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
        },
        required: ["expression", "reason", "law_id", "law", "level"],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          revised: { type: "string" },
          point: { type: "string" },
        },
        required: ["original", "revised", "point"],
        additionalProperties: false,
      },
    },
    legal_basis: {
      type: "array",
      description: "この診断で根拠にした法令の要約",
      items: {
        type: "object",
        properties: {
          law_id: { type: "string" },
          name: { type: "string" },
          point: { type: "string", description: "この広告文との関係を1文で" },
        },
        required: ["law_id", "name", "point"],
        additionalProperties: false,
      },
    },
    advice: { type: "string", description: "薬剤師・広告コンサルからのひとこと" },
    final_judgment: { type: "string", enum: ["修正必須", "要修正", "軽微修正", "問題なし"] },
  },
  required: ["overall_risk", "risk_score", "summary", "media_notes", "risk_items", "suggestions", "legal_basis", "advice", "final_judgment"],
  additionalProperties: false,
};
