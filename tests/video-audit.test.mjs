import { auditTelops, readingRate, overlapSec, visibleLength } from "../lib/videoAudit.js";

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};
const codes = (r) => r.findings.map((f) => f.code);

console.log("\n[基本計算]");
check("改行と空白は文字数に数えない", visibleLength("あい\nうえ お") === 5);
check("読了速度＝文字数/秒", readingRate("あいうえお", 2) === 2.5);
check("秒数0なら無限大（ゼロ除算を出さない）", readingRate("あ", 0) === Infinity);
check("重なりが無ければ0秒", overlapSec({ start: 0, end: 1 }, { start: 2, end: 3 }) === 0);
check("重なり秒数を返す", overlapSec({ start: 0, end: 3 }, { start: 2, end: 5 }) === 1);

console.log("\n[読了速度と最低秒数]");
check("速すぎるテロップはNG",
  codes(auditTelops({ requirePr: false, telops: [{ start: 0, end: 2, text: "あ".repeat(30) }] })).includes("RATE_OVER"));
check("読める速度なら指摘なし",
  auditTelops({ requirePr: false, telops: [{ start: 0, end: 6, text: "あ".repeat(30) }] }).ng === 0);
check("法定明示は本文より厳しい上限が効く",
  codes(auditTelops({ requirePr: false, telops: [{ start: 0, end: 6, text: "あ".repeat(33), role: "legal" }] })).includes("RATE_OVER"));
check("短すぎる打消し表示はNG",
  codes(auditTelops({ requirePr: false, telops: [{ start: 0, end: 2, text: "個人差", role: "disclaimer" }] })).includes("TOO_SHORT"));

console.log("\n[打消し表示と強調表示の同時性]");
const split = auditTelops({
  requirePr: false,
  telops: [
    { id: "claim", start: 0, end: 5, text: "スッキリを実感" },
    { id: "note", start: 6, end: 11, text: "個人の感想です", role: "disclaimer", anchors: ["claim"] },
  ],
});
check("別カットの打消し表示はNG", codes(split).includes("DISCLAIMER_NO_OVERLAP"));
const together = auditTelops({
  requirePr: false,
  telops: [
    { id: "claim", start: 0, end: 8, text: "スッキリを実感" },
    { id: "note", start: 0, end: 8, text: "個人の感想です", role: "disclaimer", anchors: ["claim"] },
  ],
});
check("同一画面に十分な時間出ていれば通る", together.ng === 0);
check("存在しない anchors はNG",
  codes(auditTelops({ requirePr: false, telops: [{ start: 0, end: 8, text: "個人の感想です", role: "disclaimer", anchors: ["nope"] }] })).includes("ANCHOR_MISSING"));

console.log("\n[ステマ規制のPR表記]");
check("PR表記が無ければ指摘する",
  codes(auditTelops({ telops: [{ start: 0, end: 6, text: "使ってみました" }] })).includes("PR_MISSING"));
check("PR表記が遅ければNG",
  codes(auditTelops({ telops: [{ start: 0, end: 20, text: "使ってみました" }, { start: 10, end: 14, text: "PR", role: "pr" }] })).includes("PR_LATE"));
check("冒頭のPR表記なら通る",
  auditTelops({ telops: [{ start: 0, end: 20, text: "使ってみました" }, { start: 0, end: 4, text: "PR", role: "pr" }] }).ng === 0);

console.log("\n[時間の整合と必須項目]");
check("start>=end はNG",
  codes(auditTelops({ requirePr: false, telops: [{ start: 5, end: 5, text: "あ" }] })).includes("TIME_INVALID"));
check("動画尺を超えるテロップはNG",
  codes(auditTelops({ requirePr: false, duration: 10, telops: [{ start: 8, end: 12, text: "あ".repeat(5) }] })).includes("TIME_OVERRUN"));
check("必須項目の欠落を検出する",
  codes(auditTelops({ requirePr: false, required: ["受動喫煙"], telops: [{ start: 0, end: 6, text: "賃金は月給制" }] })).includes("REQUIRED_MISSING"));
check("テロップ0件はNG", codes(auditTelops({ telops: [] })).includes("EMPTY"));

console.log("\n[禁止語]");
check("確定稿に残った「要記入」を弾く",
  codes(auditTelops({ requirePr: false, telops: [{ start: 0, end: 6, text: "要記入：月給" }] })).includes("FORBIDDEN_WORD"));
check("案件固有の禁止語を指定できる（求人の年齢制限）",
  codes(auditTelops({ requirePr: false, forbidden: ["若手歓迎"], telops: [{ start: 0, end: 6, text: "若手歓迎の職場です" }] })).includes("FORBIDDEN_WORD"));
check("禁止語を空配列にすれば既定を無効化できる",
  auditTelops({ requirePr: false, forbidden: [], telops: [{ start: 0, end: 6, text: "要記入：月給" }] }).ng === 0);

console.log("\n[判定]");
check("NGがあれば要修正",
  auditTelops({ requirePr: false, telops: [{ start: 0, end: 1, text: "あ".repeat(30) }] }).verdict === "要修正");
check("指摘なしなら検収OK",
  auditTelops({ requirePr: false, telops: [{ start: 0, end: 6, text: "あ".repeat(20) }] }).verdict === "検収OK");

console.log(`\n=== pass ${pass} / fail ${fail} ===`);
process.exit(fail ? 1 : 0);
