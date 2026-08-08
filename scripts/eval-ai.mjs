#!/usr/bin/env node
// 診断品質の評価・AIレイヤー（ROADMAP の M2）
//
//   npm run eval:ai                      # 既定モデル（claude-fable-5）で38ケース
//   EVAL_MODEL=claude-sonnet-5 npm run eval:ai   # モデルを替えて比較
//   EVAL_LIMIT=5 npm run eval:ai         # 先頭N件だけ（動作確認用）
//
// ⚠️ AI を呼ぶので課金が発生する（38ケース × 1呼び出し）。
//    実行には ANTHROPIC_API_KEY が要る。.env.local か環境変数から読む。
//    Vercel 上のキーは sensitive 指定で取得できないため、ローカル実行には
//    console.anthropic.com で発行したキーを .env.local に置くこと。
//
// 本番の pages/api/diagnose.js と同じ呼び出し（buildPrompt / OUTPUT_SCHEMA /
// output_config / fallbacks）を再現する。利用枠・レート制限を通らないので
// 38ケースを一気に流せる。結果は tests/eval/results-<model>.json に保存し、
// 正解ラベル（confirmed）との突き合わせを標準出力と summary md に出す。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---- APIキー（環境変数 → .env.local の順） ----
function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const envPath = path.join(root, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^ANTHROPIC_API_KEY=["']?([^"'\n]+)["']?/);
      if (m && !m[1].includes("SENSITIVE")) return m[1];
    }
  }
  return null;
}
const apiKey = loadKey();
if (!apiKey) {
  console.error(
    "ANTHROPIC_API_KEY がありません。\n" +
      "Vercel のキーは sensitive 指定のため取得できません。console.anthropic.com で\n" +
      "キーを発行し、.env.local に ANTHROPIC_API_KEY=... を追記してください。\n" +
      "（.env.local は .gitignore 済み。コミットされません）"
  );
  process.exit(1);
}

// ---- engine の読み込み（tests と同じ一時展開方式） ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-ad-evalai-"));
const json = (rel) =>
  `JSON.parse(fs.readFileSync(${JSON.stringify(path.join(root, rel))}, "utf8"))`;
function stage(src, dest, rewrites = []) {
  let code = fs.readFileSync(path.join(root, src), "utf8");
  for (const [from, to] of rewrites) code = code.replaceAll(from, to);
  fs.writeFileSync(path.join(tmp, dest), code);
}
stage("lib/taxonomy.js", "taxonomy.mjs");
stage("lib/engine.js", "engine.mjs", [
  ['import lawMaster from "../data/law_master.json";', `import fs from "node:fs";\nconst lawMaster = ${json("data/law_master.json")};`],
  ['import rulebook from "../data/rulebook_v2.json";', `const rulebook = ${json("data/rulebook_v2.json")};`],
  ['from "./taxonomy"', 'from "./taxonomy.mjs"'],
]);
const { buildPrompt, OUTPUT_SCHEMA, RULE_VER, RULE_COUNT } = await import(
  pathToFileURL(path.join(tmp, "engine.mjs")).href
);

const MODEL = process.env.EVAL_MODEL || "claude-fable-5";
const EFFORT = process.env.EVAL_EFFORT || "medium";
const LIMIT = Number(process.env.EVAL_LIMIT || 0);
const CONCURRENCY = 3;

const spec = JSON.parse(fs.readFileSync(path.join(root, "tests/eval/cases.json"), "utf8"));
let cases = spec.cases.filter((c) => c.label_status === "confirmed");
if (LIMIT > 0) cases = cases.slice(0, LIMIT);
if (!cases.length) {
  console.error("confirmed のケースがありません。");
  process.exit(1);
}

console.log(`モデル ${MODEL} / effort ${EFFORT} / ルールブック ${RULE_VER}(${RULE_COUNT})`);
console.log(`対象 ${cases.length}ケース（並列${CONCURRENCY}）。課金が発生します。\n`);

async function diagnose(c) {
  const { system, user } = buildPrompt(c.text, {
    industryId: c.industry, subId: c.sub ?? null, mediaId: c.media ?? null,
    clientIndustryId: null, clientSubId: null,
  });
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  const body = {
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system,
    messages: [{ role: "user", content: user }],
  };
  if (MODEL === "claude-fable-5" || MODEL === "claude-mythos-5") {
    body.fallbacks = [{ model: "claude-opus-4-8" }];
    headers["anthropic-beta"] = "server-side-fallback-2026-06-01";
  }
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers, body: JSON.stringify(body),
  });
  const data = await res.json();
  const ms = Date.now() - t0;
  if (!res.ok) return { id: c.id, error: data?.error?.message || `HTTP ${res.status}`, ms };
  if (data.stop_reason === "refusal") return { id: c.id, error: "refusal", ms };
  let analysis;
  try {
    const textOut = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    analysis = JSON.parse(textOut);
  } catch {
    return { id: c.id, error: "parse_error", ms };
  }
  return {
    id: c.id, ms,
    judgment: analysis.final_judgment,
    risk_score: analysis.risk_score,
    sayable_n: analysis.sayable?.length ?? 0,
    risk_items_n: analysis.risk_items?.length ?? 0,
    alt_missing: (analysis.risk_items || []).filter((r) => !r.alternative || !r.alternative.trim()).length,
    usage: data.usage ? { in: data.usage.input_tokens, out: data.usage.output_tokens } : null,
    model_used: data.model || MODEL,
  };
}

const results = [];
let idx = 0;
async function worker() {
  while (idx < cases.length) {
    const c = cases[idx++];
    const r = await diagnose(c);
    r.expect = c.expect.judgment;
    r.difficulty = c.difficulty;
    results.push(r);
    const mark = r.error ? "ERR " : r.judgment === r.expect ? "ok  " : "MISS";
    console.log(
      `  ${mark} ${c.id.padEnd(14)} 期待:${String(c.expect.judgment).padEnd(4)} → ` +
      `${r.error ? r.error : r.judgment}  (${Math.round(r.ms / 1000)}s)`
    );
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// ---- 集計 ----
const SEVERITY = { "問題なし": 0, "軽微修正": 1, "要修正": 2, "修正必須": 3 };
const ok = results.filter((r) => !r.error);
const exact = ok.filter((r) => r.judgment === r.expect);
// 誤検知＝正解より厳しい方向へ2段階以上ズレた白系ケース／見逃し＝正解より甘い判定
const falsePos = ok.filter((r) => SEVERITY[r.judgment] - SEVERITY[r.expect] >= 2);
const misses = ok.filter((r) => SEVERITY[r.expect] - SEVERITY[r.judgment] >= 2);
const hard = ok.filter((r) => r.difficulty === "hard");
const hardExact = hard.filter((r) => r.judgment === r.expect);
const totalIn = ok.reduce((s, r) => s + (r.usage?.in || 0), 0);
const totalOut = ok.reduce((s, r) => s + (r.usage?.out || 0), 0);
const avgMs = ok.length ? Math.round(ok.reduce((s, r) => s + r.ms, 0) / ok.length) : 0;

console.log(`\n===== ${MODEL} =====`);
console.log(`完走          : ${ok.length} / ${results.length}（エラー ${results.length - ok.length}）`);
console.log(`判定一致      : ${exact.length} / ${ok.length}  （難判定 ${hardExact.length} / ${hard.length}）`);
console.log(`重大な過大判定: ${falsePos.length}件（2段階以上厳しい＝誤検知系） ${JSON.stringify(falsePos.map((r) => r.id))}`);
console.log(`重大な過小判定: ${misses.length}件（2段階以上甘い＝見逃し系） ${JSON.stringify(misses.map((r) => r.id))}`);
console.log(`sayable空     : ${ok.filter((r) => r.sayable_n === 0).length}件 / alternative欠落: ${ok.filter((r) => r.alt_missing > 0).length}件`);
console.log(`平均応答      : ${Math.round(avgMs / 1000)}s / トークン 入${totalIn.toLocaleString()} 出${totalOut.toLocaleString()}`);

const outPath = path.join(root, `tests/eval/results-${MODEL}.json`);
fs.writeFileSync(outPath, JSON.stringify({
  model: MODEL, effort: EFFORT, rulebook: `${RULE_VER}/${RULE_COUNT}`,
  n: results.length, exact: exact.length, hard: { n: hard.length, exact: hardExact.length },
  false_positive: falsePos.map((r) => r.id), missed: misses.map((r) => r.id),
  avg_ms: avgMs, tokens: { in: totalIn, out: totalOut },
  results,
}, null, 2));
console.log(`\n保存: tests/eval/results-${MODEL}.json`);
fs.rmSync(tmp, { recursive: true, force: true });
