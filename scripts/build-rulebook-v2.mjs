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
  // v18 追加：ペット・獣医療・医療法。「獣医療法」は「医療法」の部分一致を含むため必ず先に置く
  [/獣医療法/, "L-VET-17"],
  [/動物用医薬品等広告適正化基準/, "L-VET-DRUG"],
  [/ペットフード安全法/, "L-PF-SAFETY"],
  [/ペットフード公正競争規約/, "L-PF-FAIR"],
  [/医療広告GL|医療広告ガイドライン/, "L-MED-AD"],
  [/医療法/, "L-MED-AD"],
  // v44 追加：特定商取引法（通信販売）。既存の L-TOKUSHOHO は特定継続的役務提供（エステ）専用ノードなので別IDにする
  [/特定商取引法|特商法/, "L-TOKUSHOHO-TSUHAN"],
  // v19.1 追加：あはき柔整広告GL。従来 L-SEITAI は genreLawIds() の「整体痩身」プレフィックスからしか
  // 付いておらず、ルールを別ジャンルへ横断化すると法令ノードが黙って落ちる構造だった
  // （正本 v29 で rid611/613 を 整体痩身_痩身効果 → 共通_痩身標榜 へ移した際に顕在化）。
  // 法令キーから引けるようにして、ジャンル名への依存をなくす。
  [/あはき柔整広告GL|あん摩マツサージ指圧師/, "L-SEITAI"],
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
  // v18 追加ジャンル：ペット・獣医療 → G、薬局/助産所 → A2、広告制作 → F
  if (g.startsWith("ペット") || g.startsWith("獣医療")) return { industries: ["G"], subs: [] };
  if (g.startsWith("薬局") || g.startsWith("助産所")) return { industries: ["A2"], subs: [] };
  if (g.startsWith("広告制作")) return { industries: ["F"], subs: [] };
  return { industries: [], subs: [] };
}

// ---- genre → 追加 law_id（法令テキストに現れない法令ノードを紐づける） ----
function genreLawIds(genre) {
  const g = String(genre || "");
  if (g.startsWith("整体痩身")) return ["L-SEITAI", "L-KEIHYO-5"];
  if (g === "医療広告_処方箋医薬品") return ["L-MED-AD", "L-PHARM"];
  if (g.startsWith("医療広告")) return ["L-MED-AD"];
  if (g.startsWith("医療機器")) return ["L-MED-DEVICE"];
  // v40 追加：医療機器該当性は業種横断（共通_）なので上の 医療機器 プレフィックスに当たらない。
  // 法令欄から L-YAKKI-68 / L-YAKKI-66 は付くが、機器の法令ノードは genre からしか紐づかない。
  if (g === "共通_医療機器該当性") return ["L-MED-DEVICE"];
  // v18 追加ジャンル
  if (g === "ペット_表示区分") return ["L-PF-FAIR", "L-KEIHYO-5"];
  if (g === "ペット_法定表示") return ["L-PF-SAFETY"];
  if (g.startsWith("ペット")) return ["L-VET-DRUG", "L-KEIHYO-5"];
  if (g.startsWith("獣医療")) return ["L-VET-17"];
  if (g.startsWith("薬局")) return ["L-PHARM", "L-TEKISEI"];
  if (g.startsWith("助産所")) return ["L-MID", "L-MED-AD"];
  if (g.startsWith("広告制作")) return ["L-AFFILI", "L-KEIHYO-5"];
  return [];
}

// ---- 広告診断に載せないジャンル ----
// 「食品表示_無添加（パッケージ）」は消費者庁の不使用表示ガイドライン由来で、
// 対象は容器包装の表示のみ。広告は規制対象外なので広告診断へ機械適用しない。
// 「ペット_法定表示」もペットフード安全法に基づく容器包装表示専用のため同様に除外する。
const EXCLUDED_GENRE = /^(食品表示_|ペット_法定表示)/;

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

// ---- 条件付きプロファイル（既定 OFF） ----
// 正本の「百貨店_店頭厳しめ」（rule_id 688-793）は三越伊勢丹グループの店頭基準
// 由来で、法令ではなく取引先の私的基準。百貨店の店頭に卸す案件だけが従う。
// これを既定の診断に混ぜると、通常の広告表現がほぼ全部ひっかかって使い物に
// ならない（まさの指示：「百貨店基準は常にONはダメ」）。
//
// フラグで切り替える設計にすると、既定値の取り違え一発で全案件に降ってくる。
// そうならないよう出力ファイルごと分ける。rulebook_v2.json（＝engine.js が
// 読む唯一のルールセット）には決して入らない。使うときは呼ぶ側が明示的に
// rulebook_profile_depstore.json を読む。既定 OFF が設定でなく構造で決まる。
const PROFILE_GENRE = /^百貨店/;

const excluded = [];
const all = [
  ...src.RB.map((r) => convert(r, "RB")),
  ...(src.DEP || []).map((r) => convert(r, "DEP")),
  ...src.EX.map((r) => convert(r, "EX")),
  ...src.CS.map((r) => convert(r, "CS")),
];

const profileRules = all.filter((r) => PROFILE_GENRE.test(String(r.genre || "")));
const converted = all.filter((r) => {
  if (PROFILE_GENRE.test(String(r.genre || ""))) return false;
  if (EXCLUDED_GENRE.test(String(r.genre || ""))) { excluded.push(String(r.id)); return false; }
  return true;
});

const { kept, dropped: dupIds } = dedupe(converted);

// 既定セットへの混入を機械で止める。ここが落ちたらビルドを失敗させる。
const leaked = kept.filter((r) => PROFILE_GENRE.test(String(r.genre || "")));
if (leaked.length) {
  console.error(`百貨店プロファイルが既定セットへ混入: ${leaked.map((r) => r.id).join(", ")}`);
  process.exit(1);
}

const out = {
  meta: {
    ...src.meta,
    schema_v2: "{id, ng, risk, genre, comment, ok, law, law_ids[], jcia, industries[], industries_sub[], media[], src, match?}",
    built_at: new Date().toISOString().slice(0, 10),
    source: "rulebook.json " + (src.meta?.version || ""),
    excluded_genre: excluded.length,
    deduped: dupIds.length,
    profile_depstore: profileRules.length, // 別ファイル。既定では適用しない
  },
  rules: kept,
};

// 検証サマリ
const noLaw = out.rules.filter((r) => r.law_ids.length === 0);
const byLaw = {};
for (const r of out.rules) for (const l of r.law_ids) byLaw[l] = (byLaw[l] || 0) + 1;

fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(path.join(root, "data", "rulebook_v2.json"), JSON.stringify(out));

// 条件付きプロファイルは別ファイル。engine.js は読まない。
fs.writeFileSync(
  path.join(root, "data", "rulebook_profile_depstore.json"),
  JSON.stringify({
    meta: {
      profile: "depstore",
      label: "百貨店_店頭厳しめ",
      default_enabled: false,
      applies_when: "百貨店の店頭に卸す案件で、取引先が店頭基準の遵守を求める場合のみ",
      caution: "法令ではなく取引先の私的基準。常時適用すると通常の広告表現がほぼ全て該当する",
      source: "rulebook.json " + (src.meta?.version || ""),
      built_at: new Date().toISOString().slice(0, 10),
      rule_count: profileRules.length,
    },
    rules: profileRules,
  })
);

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
console.log(`profile depstore (既定OFF・別ファイル): ${profileRules.length}`);
console.log(`law_id coverage:`, byLaw);
console.log(`no law_id: ${noLaw.length}`, noLaw.slice(0, 10).map((r) => `${r.id}:${r.genre}:${r.law}`));
