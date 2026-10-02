import {
  layoutClips, esc, lineWidthEm, fitFontSize, findPositionConflicts,
  telopFilter, buildFilterComplex, POSITIONS, scrimFilter,
} from "../lib/videoAssemble.js";

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

console.log("\n[カットの並び]");
const laid = layoutClips([{ file: "a", duration: 5 }, { file: "b", duration: 3 }]);
check("開始秒を積み上げる", laid[0].start === 0 && laid[1].start === 5 && laid[1].end === 8);
let threw = false; try { layoutClips([{ file: "x", duration: 0 }]); } catch { threw = true; }
check("尺0のカットは拒否する", threw);

console.log("\n[はみ出し防止]");
check("全角は1文字＝1", lineWidthEm("薬剤師") === 3);
check("半角英数は約0.55", Math.abs(lineWidthEm("PR") - 1.1) < 1e-9);
check("短い行は既定サイズのまま", fitFontSize("薬剤師募集", 64) === 64);
check("17文字の行は画面に収まるサイズへ下げる", fitFontSize("募集要項はプロフィールのリンクから", 64) * 17 <= 1080 * 0.88);
check("複数行は一番長い行で決める", fitFontSize("短い\n募集要項はプロフィールのリンクから", 64) === fitFontSize("募集要項はプロフィールのリンクから", 64));

console.log("\n[テロップの重なり]");
check("配置を指定し忘れた注記と本文の重なりを検出する", findPositionConflicts([
  { id: "c1", start: 0, end: 5, text: "本文" },
  { id: "img", start: 0, end: 10, text: "映像はイメージです" },
]).length === 1);
check("注記を note にすれば重ならない", findPositionConflicts([
  { id: "c1", start: 0, end: 5, text: "本文" },
  { id: "img", start: 0, end: 10, text: "映像はイメージです", position: "note" },
]).length === 0);
check("時間が接しているだけなら重ならない", findPositionConflicts([
  { id: "a", start: 0, end: 5 }, { id: "b", start: 5, end: 10 },
]).length === 0);

console.log("\n[フィルタ文字列]");
check("式のカンマをエスケープする", esc("between(t,1,2)") === "between(t\\,1\\,2)");
const f = telopFilter({ start: 1, end: 4, text: "あ", position: "note" }, "/tmp/t.txt", "/f.ttf");
check("note は上部の小さな文字", f.includes(`fontsize=${POSITIONS.note.size}`) && f.includes(`y=${POSITIONS.note.y}`));
check("表示時間で enable を切る", f.includes("enable=between(t\\,1\\,4)"));
const fc = buildFilterComplex(
  [{ file: "a", duration: 5 }, { file: "b", duration: 5 }],
  [{ telop: { start: 0, end: 5, text: "あ" }, file: "/tmp/t.txt" }], "/f.ttf");
check("全カットを concat する", fc.filter.includes("concat=n=2:v=1:a=0[base]") && fc.total === 10);
check("縦型1080x1920にそろえる", fc.filter.includes("crop=1080:1920"));

console.log("\n[見た目]");
const fb = telopFilter({ start: 0, end: 3, text: "あ" }, "/t", "/f");
check("既定は黒帯", fb.includes("box=1"));
const fs2 = telopFilter({ start: 0, end: 3, text: "あ" }, "/t", "/f", 0.3, "shadow");
check("shadow は帯なしで縁と影", !fs2.includes("box=1") && fs2.includes("borderw=") && fs2.includes("shadowy="));
check("size で文字を大きくできる", telopFilter({ start: 0, end: 3, text: "あ", size: 80 }, "/t", "/f").includes("fontsize=80"));
check("size を上げても画面幅には収める", telopFilter({ start: 0, end: 3, text: "あ".repeat(20), size: 120 }, "/t", "/f").includes(`fontsize=${Math.floor(1080 * 0.88 / 20)}`));
const fcS = buildFilterComplex([{ file: "a", duration: 5 }], [], "/f", { scrim: true });
check("scrim を指定すると下側を暗くする", fcS.filter.includes(scrimFilter()));

console.log(`\n=== pass ${pass} / fail ${fail} ===`);
process.exit(fail ? 1 : 0);
