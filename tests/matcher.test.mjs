// ルール照合（matchRules）の回帰テスト
//
//   npm run test:matcher
//
// AI を呼ばない。外部通信も課金も発生しない。
//
// このテストが存在する理由：
// 2026-08-07、正本 rulebook_master の rule_id 604（共通_ステマ）のNG表現に
// 「依頼・提供に基づく投稿」という散文を追記したところ、matchRules が NG表現を
// ／ と ・ で分割する仕様（engine.js）により「依頼」が2文字の独立した照合語に
// なった。604 は industries が空＝全業種の横断ルールであるため、
// 「ご依頼はこちら」を含む一般的な広告文がステマ規制ルールに直接一致していた。
//
// 正本のNG表現は法令の解説として日々書き足される。そのたびに照合器の挙動が
// 静かに壊れうる。以下の Group C（中立文コーパス）はその事故を機械的に捕まえる
// ためのもので、個別ルールの正しさではなく「無関係な文で発火しないこと」を見る。
//
// 本番コードは ESM だが package.json は CJS 扱いなので Node から直接 import
// できない。ソースを一時ディレクトリへ .mjs として展開して読み込む。
// production 側には手を入れない。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-ad-matcher-test-"));

function stage(src, dest, rewrites = []) {
  let code = fs.readFileSync(path.join(root, src), "utf8");
  for (const [from, to] of rewrites) code = code.replaceAll(from, to);
  fs.writeFileSync(path.join(tmp, dest), code);
}

// JSON の import は Node の素の ESM では import attributes が要るため、
// テスト用に fs 読み込みへ置き換える。ロジックには一切触れない。
const json = (rel) =>
  `JSON.parse(fs.readFileSync(${JSON.stringify(path.join(root, rel))}, "utf8"))`;

stage("lib/taxonomy.js", "taxonomy.mjs");
stage("lib/engine.js", "engine.mjs", [
  ['import lawMaster from "../data/law_master.json";', `import fs from "node:fs";\nconst lawMaster = ${json("data/law_master.json")};`],
  ['import rulebook from "../data/rulebook_v2.json";', `const rulebook = ${json("data/rulebook_v2.json")};`],
  ['from "./taxonomy"', 'from "./taxonomy.mjs"'],
]);

const { matchRules, RULE_COUNT } = await import(
  pathToFileURL(path.join(tmp, "engine.mjs")).href
);
const rulebook = JSON.parse(
  fs.readFileSync(path.join(root, "data/rulebook_v2.json"), "utf8")
);
const { INDUSTRIES } = await import(pathToFileURL(path.join(tmp, "taxonomy.mjs")).href);

let pass = 0;
let fail = 0;
const check = (label, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  NG   ${label}${detail ? `\n       ${detail}` : ""}`);
  }
};

const ids = (text, ind, sub) => matchRules(text, ind, sub).map((r) => r.id);
const direct = (text, ind, sub) =>
  matchRules(text, ind, sub).filter((r) => r.matchType === "direct");

// 横断ルール（industries が空）＝全業種に適用されるもの。
// 誤検知の影響が最も広いため、このテストの主対象。
const CROSS = rulebook.rules.filter((r) => !r.industries || r.industries.length === 0);

// ---------------------------------------------------------------
console.log("\n[Group A] 回帰：2026-08-07 の 604 誤検知");
// ---------------------------------------------------------------

const A_CASES = [
  ["整体の施術のご依頼はこちらから。お気軽にお問い合わせください。", "C", "seitai"],
  ["無料カウンセリングのご依頼を承ります。", "D", "esthe"],
  ["原稿のご依頼・ご相談はメールにて受け付けています。", "F", "agency"],
];
for (const [text, ind, sub] of A_CASES) {
  const hit = ids(text, ind, sub);
  check(
    `「${text.slice(0, 20)}…」で 604 が発火しない`,
    !hit.includes(604),
    `一致したrule_id: ${JSON.stringify(hit)}`
  );
}

// ---------------------------------------------------------------
console.log("\n[Group B] 検出できるべきもの（真陽性の維持）");
// ---------------------------------------------------------------

check(
  "「口コミ」を含む文で 604（ステマ）が発火する",
  ids("SNSでも大人気！愛用者の口コミ多数。", "E", "supp").includes(604),
  "604 の照合語「口コミ」が失われている可能性がある"
);

check(
  "「シミが消える」が業種E・化粧品で1件以上一致する",
  matchRules("塗るだけでシミが消える。", "E", "cosme").length > 0
);

check(
  "無害な文では一致が0件になる",
  matchRules("本日は晴天なり。営業時間は9時から18時です。", "E", "supp").length === 0,
  `一致: ${JSON.stringify(ids("本日は晴天なり。営業時間は9時から18時です。", "E", "supp"))}`
);

// ---------------------------------------------------------------
console.log("\n[Group C] 中立文コーパス：横断ルールが発火しないこと");
// ---------------------------------------------------------------
//
// 広告の定型句・事務的な文言だけで構成した文。法令上の問題を含まないので、
// 全業種に適用される横断ルールがここで direct 一致してはいけない。
// 正本のNG表現に散文を書き足したときの巻き込み事故を、この群が検知する。

const NEUTRAL = [
  "ご依頼・ご相談はこちらのフォームからお願いいたします。",
  "お問い合わせいただきありがとうございます。担当者より折り返しご連絡します。",
  "送料無料でお届けします。お支払いはクレジットカードまたは代金引換をご利用ください。",
  "営業時間は平日10時から18時まで、土日祝日は休業とさせていただきます。",
  "会員登録をしていただくとマイページから注文履歴をご確認いただけます。",
  "商品の返品・交換は到着後8日以内にご連絡ください。",
  "駐車場は店舗裏に3台分ご用意しております。ご予約の際にお申し付けください。",
  "当社は個人情報の取扱いに関する方針を定め、適切に管理しています。",
  "スタッフ募集中です。詳しくは採用情報のページをご覧ください。",
  "本キャンペーンの提供期間は9月30日までとなります。",
];

// 全業種 × 中立文 で横断ルールの direct 一致を探す
const leaks = [];
for (const text of NEUTRAL) {
  for (const ind of INDUSTRIES) {
    for (const r of direct(text, ind.id, undefined)) {
      if (!r.industries || r.industries.length === 0) {
        leaks.push({ text: text.slice(0, 24), industry: ind.id, rule: r.id, ng: r.ng.slice(0, 30) });
      }
    }
  }
}
check(
  `中立文${NEUTRAL.length}件 × 全業種${INDUSTRIES.length}種で、横断ルールの直接一致が0件`,
  leaks.length === 0,
  leaks.length
    ? `漏れ ${leaks.length}件（先頭3件）: ${JSON.stringify(leaks.slice(0, 3), null, 1)}`
    : ""
);

// ---------------------------------------------------------------
console.log("\n[Group D] データの構造");
// ---------------------------------------------------------------

const KNOWN_INDUSTRIES = new Set(INDUSTRIES.map((i) => i.id));
// H（CBD・カンナビノイド）は taxonomy 未実装。法令ノード側にのみ存在し、
// ルール側には現時点で存在しないはず。存在したら診断から漏れる。
const unknownInd = rulebook.rules.filter((r) =>
  (r.industries || []).some((i) => !KNOWN_INDUSTRIES.has(i))
);
check(
  "全ルールの industries が taxonomy に存在する業種のみを指す",
  unknownInd.length === 0,
  unknownInd.length ? `未知の業種を持つrule_id: ${JSON.stringify(unknownInd.map((r) => r.id).slice(0, 10))}` : ""
);

const noLaw = rulebook.rules.filter((r) => !r.law_ids || r.law_ids.length === 0);
check("law_ids を持たないルールが無い", noLaw.length === 0,
  noLaw.length ? `rule_id: ${JSON.stringify(noLaw.map((r) => r.id).slice(0, 10))}` : "");

check(`RULE_COUNT が rulebook の件数と一致（${RULE_COUNT}件）`, RULE_COUNT === rulebook.rules.length);

console.log(`\n  参考：横断ルール（全業種適用）は ${CROSS.length} 件`);

// ---------------------------------------------------------------
console.log("\n[Group E] 既知の欠陥（非ブロッキング・PR2で対処）");
// ---------------------------------------------------------------
//
// 現時点で直っていないもの。ゲートを赤にしないが、毎回可視化する。
// 直したらここから Group B へ移すこと。

let warn = 0;
const known = (label, resolved, detail = "") => {
  if (resolved) {
    console.log(`  直った ${label} — Group B へ移すこと`);
  } else {
    warn++;
    console.log(`  WARN ${label}${detail ? `\n       ${detail}` : ""}`);
  }
};

// (1) 1文字のNG表現は engine.js の足切り（raw.length < 2）で照合対象から落ちる。
//     rule 908「癌」はリスク100・薬機法68条・刑事罰対象でありながら一度も発火しない。
//     カタカナの 909「ガン」は2文字なので発火するため、漢字表記だけが素通りする。
const oneChar = rulebook.rules.filter((r) => {
  const raw = String(r.ng || "").replace(/[　\s×△○＊]+/g, "").trim();
  return raw.length === 1;
});
known(
  "1文字のNG表現が照合対象から落ちる",
  oneChar.length === 0 && ids("このサプリで癌が治る", "E", "supp").includes(908),
  `照合されないrule_id: ${JSON.stringify(oneChar.map((r) => ({ id: r.id, ng: r.ng, risk: r.risk })))}` +
    `\n       「このサプリで癌が治る」の一致: ${JSON.stringify(ids("このサプリで癌が治る", "E", "supp"))}（908 が無い）`
);

// (2) 業種Eに痩身の汎用ルールが無い。611「痩せる／必ず痩せる／運動なしで痩せる」は
//     業種 B/C/D（施術系・美容サービス）限定で、健康食品・サプリには当たらない。
//     PR2 の「業種別ルールの薄さ」の実例。
known(
  "業種E（健康食品）に痩身の汎用ルールが無い",
  matchRules("飲むだけで痩せる。運動なしで確実に痩せます。", "E", "supp").length > 0,
  `「飲むだけで痩せる。運動なしで確実に痩せます。」の一致: ` +
    `${JSON.stringify(ids("飲むだけで痩せる。運動なしで確実に痩せます。", "E", "supp"))}（0件）` +
    `\n       611 は industries ${JSON.stringify(rulebook.rules.find((r) => r.id === 611)?.industries)} 限定`
);

// (3) 2文字の照合語は語の文脈を見ないため、無関係なルールに当たることがある。
//     業種E内の2文字語（美白・シミ・安心等）は保証表現として意図的なものが多いが、
//     「予防」のような汎用語は誤爆する。
known(
  "2文字の照合語が文脈を無視して当たる",
  !ids("癌の予防に効果があります", "E", "cosme").includes(517),
  `「癌の予防に効果があります」の一致: ${JSON.stringify(ids("癌の予防に効果があります", "E", "cosme"))}` +
    `\n       517 はシワのルール。「予防」の2文字だけで当たっている`
);

// ---------------------------------------------------------------
console.log(`\n=== pass ${pass} / fail ${fail} / 既知の欠陥 ${warn} ===`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
