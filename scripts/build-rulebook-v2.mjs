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

// ---- genre → 業種タグ ----
function toIndustry(genre) {
  const g = String(genre || "");
  if (g.startsWith("共通")) return { industries: [], subs: [] }; // 横断
  if (g.startsWith("健康食品")) return { industries: ["E"], subs: ["supp", "func"] };
  if (g.startsWith("化粧品")) return { industries: ["E"], subs: ["cosme"] };
  if (g.startsWith("医薬部外品")) return { industries: ["E"], subs: ["quasi", "cosme"] };
  // v16 追加ジャンル：施術系（整体・整骨・痩身）→ B/C/D、医療広告（GLP-1）→ A
  if (g.startsWith("整体痩身")) return { industries: ["B", "C", "D"], subs: [] };
  // v17 追加ジャンル：処方箋医薬品は医療機関＋薬局（A/A2）、医療機器の認証効能は機器を売る側（E）と使う側（D）
  if (g === "医療広告_処方箋医薬品") return { industries: ["A", "A2"], subs: [] };
  if (g.startsWith("医療広告")) return { industries: ["A"], subs: [] };
  if (g.startsWith("医療機器")) return { industries: ["E", "D"], subs: [] };
  return { industries: [], subs: [] };
}

// ---- genre → 追加 law_id（法令テキストに現れない法令ノードを紐づける） ----
function genreLawIds(genre) {
  const g = String(genre || "");
  if (g.startsWith("整体痩身")) return ["L-SEITAI", "L-KEIHYO-5"];
  if (g === "医療広告_処方箋医薬品") return ["L-MED-AD", "L-PHARM"];
  if (g.startsWith("医療広告")) return ["L-MED-AD"];
  if (g.startsWith("医療機器")) return ["L-MED-DEVICE"];
  return [];
}

// ---- 広告診断に載せないジャンル ----
// 「食品表示_無添加（パッケージ）」は消費者庁の不使用表示ガイドライン由来で、
// 対象は容器包装の表示のみ。広告は規制対象外なので広告診断へ機械適用しない。
const EXCLUDED_GENRE = /^食品表示_/;

// 照合語の明示指定。NG表現からの自動導出が破綻するルールだけを救う。
// 詳細と運用ルールは data/match_overrides.json の _note / _rules を参照。
const overrides = JSON.parse(
  fs.readFileSync(path.join(root, "data", "match_overrides.json"), "utf8")
);

function convert(row, src_) {
  const [id, ng, risk, genre, comment, ok, law, jcia] = row;
  const { industries, subs } = toIndustry(genre);
  const law_ids = toLawIds(law);
  // genre 由来の law_id を追加（テキストに出ない法令ノードを紐づけ）
  for (const gid of genreLawIds(genre)) if (!law_ids.includes(gid)) law_ids.push(gid);
  // 補完: 健康食品で効能系なのに法令欄が空のケース → 66条を既定に
  if (law_ids.length === 0 && industries.includes("E")) law_ids.push("L-YAKKI-66");
  const ov = overrides[String(id)];
  return {
    id, ng, risk, genre,
    ...(ov?.terms?.length ? { match: ov.terms } : {}),
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

// rulebook.json の CS 配列には、C5-01〜C5-58 がブロックごと2回コピーされた
// 完全重複が含まれる（内容もバイト単位で同一）。正本 rulebook_master 由来の
// 事故で、放置すると同じ指摘が二重に出るうえ、ルール件数の定義も割れる。
// ここで id をキーに先勝ちで落とす。何件落としたかは必ず表示する。
function dedupe(rules) {
  const seen = new Set();
  const kept = [];
  const dropped = [];
  for (const r of rules) {
    const key = String(r.id);
    if (seen.has(key)) { dropped.push(key); continue; }
    seen.add(key);
    kept.push(r);
  }
  return { kept, dropped };
}

const excluded = [];
const converted = [
  ...src.RB.map((r) => convert(r, "RB")),
  ...src.EX.map((r) => convert(r, "EX")),
  ...src.CS.map((r) => convert(r, "CS")),
].filter((r) => {
  if (EXCLUDED_GENRE.test(String(r.genre || ""))) { excluded.push(String(r.id)); return false; }
  return true;
});

const { kept, dropped: dupIds } = dedupe(converted);

const out = {
  meta: {
    ...src.meta,
    schema_v2: "{id, ng, risk, genre, comment, ok, law, law_ids[], jcia, industries[], industries_sub[], media[], src, match?}",
    built_at: new Date().toISOString().slice(0, 10),
    source: "rulebook.json " + (src.meta?.version || ""),
    excluded_genre: excluded.length,
    deduped: dupIds.length,
  },
  rules: kept,
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
    rule_updated: src.meta?.updated || "",
    law_count: law.laws.length,
    law_verified: law.laws.filter((l) => l.verified).length,
  })
);

if (excluded.length) console.log(`excluded (${EXCLUDED_GENRE}): ${excluded.length}`);
if (dupIds.length) {
  console.log(`deduped: ${dupIds.length}  ${dupIds.slice(0, 3).join(", ")}${dupIds.length > 3 ? " …" : ""}`);
}
console.log(`rules: ${out.rules.length}`);
console.log(`law_id coverage:`, byLaw);
console.log(`no law_id: ${noLaw.length}`, noLaw.slice(0, 10).map((r) => `${r.id}:${r.genre}:${r.law}`));
