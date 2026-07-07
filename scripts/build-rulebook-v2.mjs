#!/usr/bin/env node
// rulebook.json（タプル配列 v15）→ data/rulebook_v2.json（オブジェクト形式＋law_ids/業種タグ）
// 使い方: node scripts/build-rulebook-v2.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = JSON.parse(fs.readFileSync(path.join(root, "rulebook.json"), "utf8"));

// ---- 法令欄テキスト → law_id 変換表 ----
const LAW_PATTERNS = [
  [/薬機法_?第66条/, "L-YAKKI-66"],
  [/薬機法_?第68条/, "L-YAKKI-68"],
  [/薬機法_?第2条/, "L-YAKKI-2"],
  [/適正広告基準|医薬品等適正広告基準/, "L-TEKISEI"],
  [/健康増進法/, "L-KENZO-65"],
  [/景表法_?第5条第3号/, "L-STEMA"],
  [/景品?表示法|景表法/, "L-KEIHYO-5"],
  [/食品表示法_?機能性表示食品|機能性表示/, "L-KINOSEI"],
];

function toLawIds(lawStr) {
  const ids = new Set();
  for (const token of String(lawStr || "").split(/[,、]/)) {
    const t = token.trim();
    if (!t) continue;
    for (const [re, id] of LAW_PATTERNS) {
      if (re.test(t)) { ids.add(id); break; }
    }
  }
  return [...ids];
}

// ---- genre → 業種タグ（現行ルールは全てE系＋共通） ----
function toIndustry(genre) {
  const g = String(genre || "");
  if (g.startsWith("共通")) return { industries: [], subs: [] }; // 横断
  if (g.startsWith("健康食品")) return { industries: ["E"], subs: ["supp", "func"] };
  if (g.startsWith("化粧品")) return { industries: ["E"], subs: ["cosme"] };
  if (g.startsWith("医薬部外品")) return { industries: ["E"], subs: ["quasi", "cosme"] };
  return { industries: [], subs: [] };
}

function convert(row, src_) {
  const [id, ng, risk, genre, comment, ok, law, jcia] = row;
  const { industries, subs } = toIndustry(genre);
  const law_ids = toLawIds(law);
  // 補完: 健康食品で効能系なのに法令欄が空のケース → 66条を既定に
  if (law_ids.length === 0 && industries.includes("E")) law_ids.push("L-YAKKI-66");
  return {
    id, ng, risk, genre,
    comment: comment || "",
    ok: ok || "",
    law: law || "",
    law_ids,
    jcia: jcia || "",
    industries,
    industries_sub: subs,
    media: [], // 現行ルールは表現ベース＝全媒体
    src: src_,
  };
}

const out = {
  meta: {
    ...src.meta,
    schema_v2: "{id, ng, risk, genre, comment, ok, law, law_ids[], jcia, industries[], industries_sub[], media[], src}",
    built_at: new Date().toISOString().slice(0, 10),
    source: "rulebook.json " + (src.meta?.version || ""),
  },
  rules: [
    ...src.RB.map((r) => convert(r, "RB")),
    ...src.EX.map((r) => convert(r, "EX")),
    ...src.CS.map((r) => convert(r, "CS")),
  ],
};

// 検証サマリ
const noLaw = out.rules.filter((r) => r.law_ids.length === 0);
const byLaw = {};
for (const r of out.rules) for (const l of r.law_ids) byLaw[l] = (byLaw[l] || 0) + 1;

fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(path.join(root, "data", "rulebook_v2.json"), JSON.stringify(out));

// クライアント表示用の軽量スタッツ（バンドルにルール全体を載せないため）
const law = JSON.parse(fs.readFileSync(path.join(root, "data", "law_master.json"), "utf8"));
fs.writeFileSync(
  path.join(root, "data", "stats.json"),
  JSON.stringify({
    rule_count: out.rules.length,
    rule_version: src.meta?.version || "",
    law_count: law.laws.length,
    law_verified: law.laws.filter((l) => l.verified).length,
  })
);

console.log(`rules: ${out.rules.length}`);
console.log(`law_id coverage:`, byLaw);
console.log(`no law_id: ${noLaw.length}`, noLaw.slice(0, 10).map((r) => `${r.id}:${r.genre}:${r.law}`));
