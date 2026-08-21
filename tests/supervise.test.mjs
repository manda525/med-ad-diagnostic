// 監修申込CTAの回帰テスト。
// 過去の不具合＝原稿をそのまま mailto の body に入れていたため、URL長が原稿量に比例して伸び、
// 120字の原稿でも 2,739 字（Windows/Outlook の目安 2,048 字超）に達していた。
// 原稿量に関わらず URL が一定長に収まることを、ここで固定する。

import assert from "node:assert/strict";
import {
  MAILTO_SAFE_LEN, superviseFeeFor, buildSubject, buildMetaLines, buildApplyText, buildMailto,
} from "../lib/supervise.js";

const EMAIL = "masa@med-ad-masa.com";
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};

const mailtoFor = (length) => {
  const fee = superviseFeeFor(length);
  return buildMailto({ email: EMAIL, subject: buildSubject({ industryLabel: "物販・EC", length, fee }) });
};

console.log("\n[監修申込 mailto の長さ]");
for (const n of [1, 120, 500, 1000, 3000, 8000]) {
  t(`原稿${n}文字でも URL が ${MAILTO_SAFE_LEN} 字以内`, () => {
    assert.ok(mailtoFor(n).length <= MAILTO_SAFE_LEN, `${mailtoFor(n).length} 字あった`);
  });
}

t("URL長が原稿量に比例しない（1文字と8,000文字の差が100字未満）", () => {
  assert.ok(Math.abs(mailtoFor(8000).length - mailtoFor(1).length) < 100);
});

t("mailto に原稿本文が混入していない", () => {
  const marker = "混入検知用のダミー原稿テキスト";
  const url = buildMailto({ email: EMAIL, subject: buildSubject({ industryLabel: "物販・EC", length: 30, fee: 10000 }) });
  assert.ok(!url.includes(encodeURIComponent(marker)));
  assert.ok(!url.includes("診断した原稿"));
});

console.log("\n[申込本文]");
const metaLines = buildMetaLines({
  industryLabel: "物販・EC", subLabel: "化粧品・コスメ", mediaLabel: "LP（ランディングページ）",
  judgment: "修正必須", riskScore: 92, length: 8000, fee: superviseFeeFor(8000),
});

t("本文には原稿を省略せず全文入れる", () => {
  const text = "あ".repeat(8000);
  const body = buildApplyText({ metaLines, text });
  assert.ok(body.includes(text), "原稿が切られている");
  assert.ok(!body.includes("以下略"), "省略表記が残っている");
});

t("本文に見積の内訳が含まれる", () => {
  const body = buildApplyText({ metaLines, text: "テスト" });
  for (const k of ["【業種】", "【媒体】", "【AI一次判定】", "【原稿の分量】", "【監修料金】"]) {
    assert.ok(body.includes(k), `${k} が無い`);
  }
});

console.log("\n[料金]");
t("最低受託 ¥10,000 を下回らない", () => assert.equal(superviseFeeFor(100), 10000));
t("3,334文字から3円/字が効く", () => assert.equal(superviseFeeFor(3334), 10002));
t("8,000文字で ¥24,000", () => assert.equal(superviseFeeFor(8000), 24000));

console.log(`\n=== pass ${pass} / fail ${fail} ===\n`);
process.exit(fail ? 1 : 0);
