#!/usr/bin/env node
// 診断品質の評価ハーネス（ROADMAP の M2）
//
//   npm run eval
//
// tests/eval/cases.json を読み、ルール照合レイヤーを評価する。
// **AI を呼ばないので無料。** 外部通信も発生しない。
//
// 出力：
//   - 標準出力にサマリ
//   - tests/eval/REVIEW.md（まさがラベルを確認するための一覧）
//
// AIレイヤー（最終判定まで見る）は未実装。理由は、正解ラベルが confirmed に
// なるまで測っても意味がないため。ラベル確定後に着手する。
//
// 本番コードは ESM だが package.json は CJS 扱いなので Node から直接 import
// できない。tests/matcher.test.mjs と同じ方式で一時展開して読み込む。
// production 側には手を入れない。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-ad-eval-"));

function stage(src, dest, rewrites = []) {
  let code = fs.readFileSync(path.join(root, src), "utf8");
  for (const [from, to] of rewrites) code = code.replaceAll(from, to);
  fs.writeFileSync(path.join(tmp, dest), code);
}
const json = (rel) =>
  `JSON.parse(fs.readFileSync(${JSON.stringify(path.join(root, rel))}, "utf8"))`;

stage("lib/taxonomy.js", "taxonomy.mjs");
stage("lib/engine.js", "engine.mjs", [
  ['import lawMaster from "../data/law_master.json";', `import fs from "node:fs";\nconst lawMaster = ${json("data/law_master.json")};`],
  ['import rulebook from "../data/rulebook_v2.json";', `const rulebook = ${json("data/rulebook_v2.json")};`],
  ['from "./taxonomy"', 'from "./taxonomy.mjs"'],
]);

const { matchRules, RULE_COUNT, RULE_VER } = await import(
  pathToFileURL(path.join(tmp, "engine.mjs")).href
);
const { industryById, mediaById, INDUSTRIES } = await import(
  pathToFileURL(path.join(tmp, "taxonomy.mjs")).href
);

const spec = JSON.parse(
  fs.readFileSync(path.join(root, "tests/eval/cases.json"), "utf8")
);
const cases = spec.cases;

if (process.argv.includes("--ai")) {
  console.error(
    "--ai は未実装です。\n" +
      "正解ラベルが confirmed になるまで最終判定を測っても意味がないため、\n" +
      "ラベル確定後に着手します（AI呼び出しは課金が発生します）。"
  );
  process.exit(1);
}

// ---- ルール照合レイヤーの評価 ----

const results = cases.map((c) => {
  const matched = matchRules(c.text, c.industry, c.sub ?? undefined);
  const ids = matched.map((r) => r.id);
  const want = c.expect?.must_match ?? [];
  const avoid = c.expect?.must_not_match ?? [];
  const missing = want.filter((id) => !ids.includes(id));
  const leaked = avoid.filter((id) => ids.includes(id));
  const ok = missing.length === 0 && leaked.length === 0;
  // 既知の欠陥として明示されているケースは、落ちてもゲートを赤にしない。
  // 直したときに「直った」と気づけるよう、期待値そのものは残しておく。
  return { c, matched, ids, missing, leaked, ok, known: Boolean(c.known_defect) };
});

const failed = results.filter((r) => !r.ok && !r.known);
const knownFailing = results.filter((r) => !r.ok && r.known);
const knownFixed = results.filter((r) => r.ok && r.known);
const confirmed = cases.filter((c) => c.label_status === "confirmed").length;

// 白ケース（問題なしが正解）でルールが1件でも当たっていれば誤検知の候補
const whiteNoise = results.filter(
  (r) => r.c.expect?.judgment === "問題なし" && r.ids.length > 0
);
// 黒ケース（修正必須が正解）でルールが1件も当たっていなければ見逃しの候補
const blackSilent = results.filter(
  (r) => r.c.expect?.judgment === "修正必須" && r.ids.length === 0
);

console.log(`\nルールブック ${RULE_VER} / ${RULE_COUNT}件`);
console.log(`ケース ${cases.length}件（正解ラベル確定済み ${confirmed}件）\n`);

for (const r of results) {
  const mark = r.ok ? (r.known ? "直った" : "ok  ") : r.known ? "WARN" : "NG  ";
  const tag = r.c.difficulty === "hard" ? "[難]" : "[易]";
  console.log(
    `  ${mark}${tag} ${r.c.id.padEnd(14)} 照合${String(r.ids.length).padStart(2)}件  ${r.c.expect.judgment}`
  );
  if (r.missing.length) console.log(`         期待したルールが出ない: ${JSON.stringify(r.missing)}`);
  if (r.leaked.length) console.log(`         出てはいけないルールが出た: ${JSON.stringify(r.leaked)}`);
}

console.log(`\n--- ルール照合の期待値 ---`);
console.log(`  合致 ${results.filter((r) => r.ok).length} / ${results.length}`);
if (knownFailing.length) console.log(`  既知の欠陥で落ちている: ${knownFailing.length}件（ゲートは赤にしない）`);
if (knownFixed.length) console.log(`  既知の欠陥が直った: ${knownFixed.map((r) => r.c.id).join(", ")} ← cases.json の known_defect を消すこと`);
console.log(`\n--- 参考指標（正解ラベル未確定のため暫定） ---`);
console.log(`  白ケースでルールが当たった   : ${whiteNoise.length} / ${results.filter((r) => r.c.expect?.judgment === "問題なし").length}  ← 誤検知の候補`);
console.log(`  黒ケースでルールが0件だった   : ${blackSilent.length} / ${results.filter((r) => r.c.expect?.judgment === "修正必須").length}  ← 見逃しの候補`);
console.log(`\n  ※ルール層が0件でも最終判定はAIが行うため、そのまま見逃しにはならない。`);
console.log(`    AIへ渡す根拠が無い状態であることを示す指標として読む。`);

// ---- 業種別のルール被覆 ----
// 見逃しの多くは「その業種のルールが存在しない」ことに起因する。
// UIは8業種を選ばせるので、業種ごとの厚みは品質の前提条件になる。
const rulebook = JSON.parse(
  fs.readFileSync(path.join(root, "data/rulebook_v2.json"), "utf8")
);
const coverage = INDUSTRIES.map((i) => ({
  id: i.id,
  label: i.label,
  n: rulebook.rules.filter((r) => (r.industries || []).includes(i.id)).length,
}));
const cross = rulebook.rules.filter((r) => !(r.industries || []).length).length;

console.log(`\n--- 業種別のルール被覆 ---`);
for (const c of coverage) {
  const bar = "█".repeat(Math.min(30, Math.ceil(c.n / 25))) || "";
  const warn = c.n === 0 ? "  ← ルールが1件も無い" : c.n < 10 ? "  ← 薄い" : "";
  console.log(`  ${c.id.padEnd(3)} ${c.label.padEnd(12)} ${String(c.n).padStart(4)}件 ${bar}${warn}`);
}
console.log(`  ${"横断".padEnd(16)} ${String(cross).padStart(4)}件`);
console.log("");

// ---- REVIEW.md の生成 ----

const esc = (s) => String(s).replace(/\|/g, "\\|");
const lines = [];
lines.push("# 評価セット レビュー用一覧");
lines.push("");
lines.push(`生成：\`npm run eval\`（ルールブック ${RULE_VER} / ${RULE_COUNT}件）`);
lines.push("");
lines.push("**このファイルは自動生成される。直接編集しない。** 直すのは `tests/eval/cases.json` のほう。");
lines.push("");
lines.push("## まさにお願いすること");
lines.push("");
lines.push("各ケースの「**判定（提案）**」が妥当かを見てください。**判定だけで結構です。**");
lines.push("");
lines.push("- 妥当 → `cases.json` の該当ケースの `label_status` を `\"confirmed\"` に変える");
lines.push("- 違う → `expect.judgment` を直してから `confirmed` に変える");
lines.push("");
lines.push("「照合されたルール」は参考情報です。ここが薄くても最終判定はAIが行うので、**ルールの当たり外れは気にしなくて構いません。**");
lines.push("");
lines.push(`確定済み **${confirmed} / ${cases.length}件**。全部 confirmed になるまで、この評価の数字は対外に出しません。`);
lines.push("");
lines.push("## 業種別のルール被覆（参考）");
lines.push("");
lines.push("UIは8業種を選ばせるが、ルールの厚みは業種によって大きく違う。見逃しの多くはここに起因する。");
lines.push("");
lines.push("| 業種 | ルール数 |");
lines.push("|---|---|");
for (const c of coverage) lines.push(`| ${c.id} ${esc(c.label)} | ${c.n}${c.n === 0 ? " ← 1件も無い" : c.n < 10 ? " ← 薄い" : ""} |`);
lines.push(`| 横断（全業種） | ${cross} |`);
lines.push("");
lines.push("---");
lines.push("");

for (const r of results) {
  const c = r.c;
  const ind = industryById(c.industry);
  const sub = ind?.subs?.find((s) => s.id === c.sub);
  const med = mediaById(c.media);
  lines.push(`## ${c.id}　${c.difficulty === "hard" ? "難判定" : "明確"}　${c.label_status === "confirmed" ? "✅確定" : "⬜未確定"}`);
  lines.push("");
  lines.push(`**業種**：${ind?.label ?? c.industry}${sub ? `（${sub.label}）` : ""}　**媒体**：${med?.label ?? c.media}`);
  lines.push("");
  lines.push("> " + c.text);
  lines.push("");
  lines.push(`**判定（提案）：${c.expect.judgment}**`);
  lines.push("");
  lines.push(`理由：${c.why}`);
  if (c.note) lines.push(`\n備考：${c.note}`);
  lines.push("");
  if (r.matched.length) {
    lines.push(`照合されたルール ${r.matched.length}件（上位5件）：`);
    lines.push("");
    lines.push("| rule_id | risk | ジャンル | NG表現（抜粋） |");
    lines.push("|---|---|---|---|");
    for (const m of r.matched.slice(0, 5)) {
      lines.push(`| ${m.id} | ${m.risk} | ${esc(m.genre)} | ${esc(String(m.ng).slice(0, 34))} |`);
    }
  } else {
    lines.push("照合されたルール：**0件**");
  }
  if (r.missing.length) lines.push(`\n⚠️ 期待したルールが出ていない：${JSON.stringify(r.missing)}`);
  if (r.leaked.length) lines.push(`\n⚠️ 出てはいけないルールが出た：${JSON.stringify(r.leaked)}`);
  lines.push("");
  lines.push("---");
  lines.push("");
}

const out = path.join(root, "tests/eval/REVIEW.md");
fs.writeFileSync(out, lines.join("\n"));
console.log(`レビュー用一覧を書き出しました: tests/eval/REVIEW.md\n`);

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed.length === 0 ? 0 : 1);
