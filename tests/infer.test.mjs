import { inferContext } from "../lib/infer.js";
const cases = [
  ["毎日飲むだけで内臓脂肪が燃焼し、免疫力アップ。医師の90%が推奨しています。", "E", "supp", "lp"],
  ["このコラーゲン美容液でシミが消える！たるんだ肌へ直接アプローチ。", "E", "cosme", "lp"],
  ["当院のオリジナル施術で、シワが消える・たるみを取る。院長が丁寧に診療します。", "A", "hospital", "lp"],
  ["腰痛・肩こりを根本から治療する整体院。骨盤矯正で産後の不調も完治！", "C", "seitai", "lp"],
  ["完全無添加の国産ドッグフード。関節炎を予防し、皮膚病も改善。獣医師も推奨。", "G", "petfood", "lp"],
  ["原材料名：小麦粉、砂糖／内容量：200g／保存方法：直射日光を避け…", "E", null, "package"],
  ["飲むだけでシミが消える化粧品", "E", "cosme", "banner"],
  ["#PR #提供 いただきました！ストーリーズでも紹介しています", "E", null, "sns"],
  ["接骨院の交通事故治療。柔道整復師が対応します。", "B", "judo", "lp"],
  ["脱毛サロンの新プラン。全身脱毛が通い放題。", "D", "datsumo", "lp"],
  ["調剤薬局で処方箋をお受けします。かかりつけ薬剤師が服薬指導まで対応します。", "A2", "pharmacy", "lp"],
];
let pass = 0, fail = 0;
for (const [text, ei, es, em] of cases) {
  const g = inferContext(text);
  const ok = g.industry === ei && g.sub === es && g.media === em;
  if (ok) { pass++; console.log(`  ok   ${text.slice(0, 22)}… → ${g.industry}/${g.sub}/${g.media}`); }
  else { fail++; console.log(`  FAIL ${text.slice(0, 22)}… → ${g.industry}/${g.sub}/${g.media}  期待 ${ei}/${es}/${em}`); }
}
const empty = inferContext("");
if (empty.industry === null) { pass++; console.log("  ok   空文字では推定しない"); } else { fail++; console.log("  FAIL 空文字で推定した"); }
console.log(`\n=== pass ${pass} / fail ${fail} ===`);
process.exit(fail ? 1 : 0);
