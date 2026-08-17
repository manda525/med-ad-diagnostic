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

// 明示的な照合語（data/match_overrides.json）。
// rule 908「癌」は1文字のため自動導出から落ちており、リスク100・薬機法68条・
// 刑事罰対象でありながら一度も発火していなかった（2026-08-07 修正）。
check(
  "漢字の「癌」で 908 が発火する（明示照合語）",
  ids("このサプリで癌が治る", "E", "supp").includes(908),
  `一致: ${JSON.stringify(ids("このサプリで癌が治る", "E", "supp"))}`
);
check(
  "カタカナの「ガンが治る」で 909 が発火する",
  ids("このサプリでガンが治る", "E", "supp").includes(909)
);
// 2026-08-08 の回帰。909 は「ガン」2文字だったため「ヴィーガン」に埋没して誤爆していた。
// 明示照合語を疾病文脈の句に限定して解消（data/match_overrides.json）。
check(
  "「ヴィーガン」で 909 が発火しない",
  !ids("ヴィーガン対応のCBDグミです。", "E", "supp").includes(909),
  `一致: ${JSON.stringify(ids("ヴィーガン対応のCBDグミです。", "E", "supp"))}`
);
// 638 は中黒分割で「認証」が2文字の照合語になり、オーガニック認証等で誤爆していた。
// 正本 v24 で中黒を並列助詞へ置換して解消。
check(
  "「オーガニック認証」で 638 が発火しない",
  !ids("オーガニック認証を取得しています。", "E", "supp").includes(638),
  `一致: ${JSON.stringify(ids("オーガニック認証を取得しています。", "E", "supp"))}`
);
check(
  "「癌」は業種E以外へ漏れない（908 は industries E 限定）",
  !ids("癌について解説します", "C", "seitai").includes(908),
  `一致: ${JSON.stringify(ids("癌について解説します", "C", "seitai"))}`
);
check(
  "明示照合語を持つルールが意図した数だけ存在する（908・909）",
  rulebook.rules.filter((r) => Array.isArray(r.match) && r.match.length).length === 2,
  `match を持つrule_id: ${JSON.stringify(
    rulebook.rules.filter((r) => Array.isArray(r.match) && r.match.length).map((r) => r.id)
  )}`
);

check(
  "無害な文では一致が0件になる",
  matchRules("本日は晴天なり。営業時間は9時から18時です。", "E", "supp").length === 0,
  `一致: ${JSON.stringify(ids("本日は晴天なり。営業時間は9時から18時です。", "E", "supp"))}`
);

// v17 で取り込んだ 637-640。業種タグが正しく効いているかも併せて見る。
check(
  "637（処方箋なし供給）が業種A2・薬局で発火する",
  ids("処方箋なしOKでお薬をお届けします", "A2", "pharmacy").includes(637),
  `一致: ${JSON.stringify(ids("処方箋なしOKでお薬をお届けします", "A2", "pharmacy"))}`
);
check(
  "637 は業種E（物販）へ漏れない",
  !ids("処方箋なしOKでお薬をお届けします", "E", "supp").includes(637)
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
  // 2026-08-08 追加：CBD事業者9サイトの横断スキャンで実際に誤検知したもの。
  // 「ガン」⊂「ヴィーガン」、「認証」⊂「オーガニック認証」の埋没が原因だった。
  "ヴィーガン対応・グルテンフリーのグミです。",
  "オーガニック認証を取得した原料を使用しています。",
  "ISO認証取得工場で製造し、全ロットを検査しています。",
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

// rulebook.json の CS 配列には C5-01〜C5-58 の完全重複がある。ビルド時に落として
// いるので、v2 側に重複IDが残っていてはいけない（残ると同じ指摘が二重に出る）。
const dupIds = (() => {
  const seen = new Set(), dup = [];
  for (const r of rulebook.rules) {
    const k = String(r.id);
    if (seen.has(k)) dup.push(k); else seen.add(k);
  }
  return dup;
})();
check("rule_id に重複が無い", dupIds.length === 0,
  `重複: ${dupIds.length}件 ${JSON.stringify(dupIds.slice(0, 5))}`);

check(
  `ビルドが落とした件数を meta に記録している（重複 ${rulebook.meta?.deduped ?? "?"}件）`,
  typeof rulebook.meta?.deduped === "number"
);

console.log(`\n  参考：横断ルール（全業種適用）は ${CROSS.length} 件`);

// ---------------------------------------------------------------
console.log("\n[Group D2] 否定文脈の信頼度ダウン（2026-08-16 追加）");
// ---------------------------------------------------------------
//
// 規制を「説明している」文と違反文は substring 照合では区別できない。
// コンプライアンスページ・教育記事・社内向け解説を貼った利用者に
// 片っ端から赤が出るという、いちばん心証の悪い外し方をしていた。
// 一致語の直後30字に否定・禁止の語があれば negated を立てて後ろへ回す。
//
// 除外ではなく降格なので、negated が立っても matched には残る。
// ここで見るのは「フラグが正しく立つか」と「立ててはいけない場面で立たないか」。

const negatedOf = (text, ind, sub) =>
  matchRules(text, ind, sub).filter((r) => r.negated).map((r) => r.id);
const cleanOf = (text, ind, sub) =>
  matchRules(text, ind, sub).filter((r) => !r.negated).map((r) => r.id);

// (1) 解説文では negated が立つ
const D2_NEG = [
  ["医療広告では、限定解除の要件を満たしても患者の体験談は掲載できません。", "A", "clinic"],
  ["当サイトでは、使用前後の写真は載せていません。", "D", "esthe"],
  ["「シミが消える」という表現は薬機法違反です。", "E", "cosme"],
];
for (const [text, ind, sub] of D2_NEG) {
  const all = ids(text, ind, sub);
  const neg = negatedOf(text, ind, sub);
  check(
    `解説文で negated が立つ：「${text.slice(0, 22)}…」`,
    all.length === 0 || neg.length > 0,
    `一致 ${JSON.stringify(all)} / うち negated ${JSON.stringify(neg)}`
  );
  check(
    `解説文の一致は除外でなく降格（matched に残る）：「${text.slice(0, 14)}…」`,
    neg.every((id) => all.includes(id))
  );
}

// (2) 本物の違反では negated を立てない（＝握り潰さない）
//     ここが壊れると誤検知は減るが見逃しが増える。誤検知より重い。
const D2_POS = [
  ["このクリームを塗ればシミが消える。", "E", "cosme"],
  ["飲むだけで痩せる。運動は必要ありません。", "D", "esthe"],
];
for (const [text, ind, sub] of D2_POS) {
  const all = ids(text, ind, sub);
  const clean = cleanOf(text, ind, sub);
  check(
    `違反文で negated を立てない：「${text.slice(0, 22)}…」`,
    all.length === 0 || clean.length > 0,
    `一致 ${JSON.stringify(all)} / negated でないもの ${JSON.stringify(clean)}`
  );
}

// (3) 免責文（「〜ものではありません」）を否定と読み違えない
//     「シミが消える ※効果を保証するものではありません」は
//     定型の免責であって主張の打ち消しではない。ここを否定にすると
//     免責文を添えるだけで全部素通りする穴になる。
{
  const t = "このクリームでシミが消える効果を保証するものではありません";
  const clean = cleanOf(t, "E", "cosme");
  const all = ids(t, "E", "cosme");
  check(
    "免責文を否定文脈として扱わない",
    all.length === 0 || clean.length > 0,
    `一致 ${JSON.stringify(all)} / negated でないもの ${JSON.stringify(clean)}`
  );
}

// (4) 文末記号で窓を切る（別の文の免責を直前の主張に結びつけない）
{
  const t = "このクリームでシミが消える。※効果には個人差があり保証はできません";
  const clean = cleanOf(t, "E", "cosme");
  const all = ids(t, "E", "cosme");
  check(
    "句点や※の先にある否定語を拾わない",
    all.length === 0 || clean.length > 0,
    `一致 ${JSON.stringify(all)} / negated でないもの ${JSON.stringify(clean)}`
  );
}

// (5) 同じ語が否定と主張の両方で出たら、主張を優先する
{
  const t = "患者の体験談は掲載できません。とはいえ当院の患者の体験談をご紹介します。";
  const clean = cleanOf(t, "A", "clinic");
  const all = ids(t, "A", "clinic");
  check(
    "否定と主張が混在したら主張を優先する",
    all.length === 0 || clean.length > 0,
    `一致 ${JSON.stringify(all)} / negated でないもの ${JSON.stringify(clean)}`
  );
}

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

// (1) 1文字の照合語になるルールのうち、明示指定（match）を持たないものは
//     engine.js の足切りで落ちたままになる。908 は 2026-08-07 に救済済み。
//     rule 120「心（ココロ）」は括弧を除くと「心」1文字で、これも発火しない。
//     ただし「心」は安心・中心・心地よい等に埋没するため明示指定に向かず、
//     正本側でNG表現を句に書き直すべきもの（＝まさの判断が要る）。
const deadOneChar = rulebook.rules.filter((r) => {
  if (Array.isArray(r.match) && r.match.length) return false;
  const raw = String(r.ng || "").replace(/[　\s×△○＊]+/g, "").trim();
  if (raw.length === 1) return true;
  const alts = raw.split(/[／\/・]+/).map((s) => s.replace(/[（(].*?[）)]/g, "").trim());
  return alts.length > 0 && alts.every((c) => c.length < 2);
});
known(
  "1文字にしかならないNG表現が照合対象から落ちる",
  deadOneChar.length === 0,
  `発火しないrule_id: ${JSON.stringify(deadOneChar.map((r) => ({ id: r.id, ng: r.ng, risk: r.risk })))}`
);

// (1c) 638「認証効能の範囲超過」が実際の広告文で発火しない。
//      2026-08-08 に判明。NG表現が「認証・承認された使用目的・効能効果の範囲を
//      超える疾病の治癒・緩和の標榜…」という類型の説明文で、事業者は広告に
//      「範囲を超える」とは書かないため、原理的に文字列照合で拾えない。
//      それまで発火していたのは中黒分割で生まれた2文字語「認証」による誤検知
//      （オーガニック認証等）だけだった＝誤検知を直したら真陽性がゼロになった。
//      「（効果を語る体験談）」型と同じ、類型を記述したルールの問題。
//      正本側でNG表現を実際の広告文言へ書き直す必要がある＝まさの判断。
const D638 = "認証を受けた家庭用電位治療器です。糖尿病が治る、高血圧が下がると体験会でご説明しています。";
known(
  "638 が実際の広告文で発火しない（類型記述のため照合語にならない）",
  matchRules(D638, "D", "esthe").some((r) => r.id === 638),
  `「${D638.slice(0, 30)}…」の一致: ${JSON.stringify(ids(D638, "D", "esthe"))}（638 が無い）`
);

// (1b) ひらがな単独の「がん」を拾うルールが無い。420「がんに効く」421「がん予防」は
//      句なので「がんが治る」に当たらない。「がん」の2文字照合は「がんばる」に
//      埋没するため明示指定に向かず、正本へのルール追加が要る。
known(
  "ひらがなの「がんが治る」を拾えない",
  matchRules("このサプリでがんが治る", "E", "supp").length > 0,
  `「このサプリでがんが治る」の一致: ${JSON.stringify(ids("このサプリでがんが治る", "E", "supp"))}`
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
