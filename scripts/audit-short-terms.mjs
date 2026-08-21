// 照合語が短すぎるルールの棚卸し。
// lib/engine.js のトークン化をそのまま写して、実際に「2文字だけで直接一致しうる」
// ルールを洗い出す。CLAUDE.md の未処理課題（2文字以下の照合語）用。
import fs from "node:fs";

const rb = JSON.parse(fs.readFileSync(new URL("../data/rulebook_v2.json", import.meta.url), "utf8"));
const rules = rb.rules || rb.items;

const short = [];   // core 自体が2文字＝どこにでも当たる
const phrase2 = []; // phrase 照合に使われる語に2文字が混じる

for (const rule of rules) {
  const raw = (rule.ng || "").replace(/[　\s×△○＊]+/g, "").trim();
  if (!raw || raw.length < 2) continue;
  const alts = raw.split(/[／\/・]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
  for (const ng of alts) {
    const core = ng.replace(/[（(].*?[）)]/g, "").trim();
    if (core.length < 2) continue;
    if (core.length === 2) {
      short.push({ id: rule.id, term: core, risk: rule.risk, genre: rule.genre, ind: (rule.industries || []).join("") });
    }
    const words = core.split(/[、。，,\s]+/).filter((w) => w.length >= 2);
    if (words.length >= 2) {
      for (const w of words) if (w.length === 2) phrase2.push({ id: rule.id, term: w, risk: rule.risk, genre: rule.genre, from: core.slice(0, 30) });
    }
  }
}

const byTerm = (rows) => {
  const m = new Map();
  for (const r of rows) { if (!m.has(r.term)) m.set(r.term, []); m.get(r.term).push(r); }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
};

const L = [];
L.push("# 照合語が2文字のルール 棚卸し");
L.push("");
L.push(`生成 ${process.env.AUDIT_DATE || "(日付は呼び出し側で指定)"} ／ 対象 ${rb.meta?.version || rb.version || "?"}・${rules.length}件`);
L.push("");
L.push("`lib/engine.js` の照合ロジックをそのまま写して抽出した。2文字の語は `direct` 判定で");
L.push("本文のどこにあっても一致するため、文脈を無視して当たる。");
L.push("");
L.push(`## A. 単独で2文字＝どこにでも当たる（${short.length}件）`);
L.push("");
L.push("**これが誤検知の主犯。優先して見る。**");
L.push("");
L.push("| 語 | 件数 | rule_id（risk／ジャンル／業種） |");
L.push("|---|---:|---|");
for (const [term, rows] of byTerm(short)) {
  L.push(`| \`${term}\` | ${rows.length} | ${rows.map((r) => `${r.id}（${r.risk}／${r.genre}／${r.ind}）`).join("<br>")} |`);
}
L.push("");
L.push(`## B. phrase 照合の構成語に2文字が混じる（延べ${phrase2.length}件）`);
L.push("");
L.push("2語以上の一致で発火するので A よりは安全だが、`517「予防」` の誤検知はここから出た。");
L.push("");
L.push("| 語 | 件数 | rule_id | 元の照合語 |");
L.push("|---|---:|---|---|");
for (const [term, rows] of byTerm(phrase2).slice(0, 40)) {
  L.push(`| \`${term}\` | ${rows.length} | ${[...new Set(rows.map((r) => r.id))].slice(0, 12).join(", ")} | ${rows[0].from} |`);
}
if (byTerm(phrase2).length > 40) L.push(`| … | | 他 ${byTerm(phrase2).length - 40} 語 | |`);

fs.writeFileSync(new URL("../docs/audit_2文字照合語.md", import.meta.url), L.join("\n") + "\n");
console.log(`A（単独2文字）: ${short.length}件 / ${byTerm(short).length}語`);
console.log(`B（phrase構成語）: 延べ${phrase2.length}件 / ${byTerm(phrase2).length}語`);
console.log("→ docs/audit_2文字照合語.md");
