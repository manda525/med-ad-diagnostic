// OK表現に、そのルール自身のNG照合語が入っていないかを検査する。
//
// 2026-09-19、正本の再構築（段階1-a）で、NG表現列とOK表現列が入れ替わっている行が
// 4件見つかった（rid164・183・339・343）。rid164 は「透明感を増す」（適法）をNG、
// 「美白」（一般化粧品では不可）をOKとして本番に出しており、課金ユーザーに違反表現を
// 修正案として提示していた。
//
// 人が根拠を読まないと気づけないが、「OK表現の中にそのルール自身のNG照合語がある」
// という形だけは機械で捕まえられる。段階1の残り248行を直す間の再発防止。
import fs from "node:fs";

const rb = JSON.parse(
  fs.readFileSync(new URL("../data/rulebook_v2.json", import.meta.url), "utf8"),
);
const rules = rb.rules || rb.items;

// NG表現の分割は build-rulebook-v2 / audit-short-terms と同じ規則に揃える
const terms = (ng) =>
  String(ng || "")
    .replace(/[　\s×△○＊]+/g, "")
    .split(/[／/]+/)
    .map((s) => s.replace(/[（(].*?[）)]/g, "").trim())
    .filter((s) => s.length >= 2 && !s.includes("照合語なし"));

// ⚠️ 「OK表現がNG語を含む」だけで弾いてはいけない。化粧品ルールの多数派は
// 「NG語＋限定を足すと適法」という形で、NG「シミ・ソバカスを防ぐ」→
// OK「日焼けによるシミ・ソバカスを防ぐ」が正しい姿。2026-09-19の初版はこれを
// 全部拾って40件中38件が偽陽性だった。
// 拾うのは「限定が一切足されていない＝OK表現がNG語そのもの」の場合だけ。
const hits = [];
for (const rule of rules) {
  const ok = String(rule.ok || "");
  if (!ok || ok.includes("代替表現なし")) continue;
  // OK側のカッコは「（保湿成分）」「（※角質層）」のように、適法にするための限定そのもの。
  // ここを剥がすと NG「アロエエキス配合（目的未記載）」→ OK「アロエエキス（保湿剤）配合」
  // という正しい形まで同一に見えるので、OK表現は原文のまま比べる。
  const okCore = ok.trim();
  for (const t of terms(rule.ng)) {
    if (okCore === t) {
      hits.push({ id: rule.id, term: t, ng: String(rule.ng).slice(0, 40), ok: ok.slice(0, 50) });
      break;
    }
  }
}

if (hits.length === 0) {
  console.log(`=== 極性検査 pass / ${rules.length}件中 0件 ===`);
  process.exit(0);
}
console.log(`=== 極性検査 FAIL / ${hits.length}件 ===`);
console.log("OK表現がNG語そのもので、限定が足されていません。根拠（短縮版）列を読んで、");
console.log("列が入れ替わっていないか確認してください。\n");
for (const h of hits) {
  console.log(`  rid${h.id}  NG「${h.ng}」`);
  console.log(`          OK「${h.ok}」  ← NG語「${h.term}」を含む`);
}
process.exit(1);
