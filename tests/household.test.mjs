// 世帯の医療費計算（lib/household.mjs）の回帰テスト
//
//   npm run test:household
//
// 純粋関数のみ。外部通信・課金なし。

import assert from "node:assert/strict";
import {
  summarize,
  medicalDeduction,
  selfMedDeduction,
  estimateTaxSaving,
  compareDeductions,
  specialFee,
} from "../lib/household.mjs";

let n = 0;
const test = (name, fn) => {
  fn();
  n += 1;
  console.log(`ok - ${name}`);
};

test("summarize: 医療費通知に載る分と載らない分を分ける", () => {
  const s = summarize([
    { memberId: "a", category: "insured", amount: 30000 },
    { memberId: "a", category: "special_brand", amount: 4000 },
    { memberId: "b", category: "otc", amount: 15000, treatment: true, selfmedMark: true },
    { memberId: "b", category: "excluded", amount: 20000 },
    { memberId: "b", category: "private", amount: "abc" },
  ]);
  assert.equal(s.total, 69000);
  assert.equal(s.inNotice, 30000);
  assert.equal(s.notInNotice, 39000);
  assert.equal(s.deductible, 49000);
  assert.equal(s.deductibleNotInNotice, 19000);
  assert.equal(s.selfMed, 15000);
  assert.deepEqual(s.byMember, { a: 34000, b: 35000 });
});

test("summarize: 治療目的でないOTCは医療費控除に入らない", () => {
  const s = summarize([{ memberId: "a", category: "otc", amount: 5000, treatment: false }]);
  assert.equal(s.deductible, 0);
  assert.equal(s.selfMed, 0);
});

test("medicalDeduction: 10万円の足切り", () => {
  assert.equal(medicalDeduction({ deductible: 150000, reimbursed: 20000 }).amount, 30000);
  assert.equal(medicalDeduction({ deductible: 90000 }).amount, 0);
});

test("medicalDeduction: 総所得200万円未満は5%", () => {
  const r = medicalDeduction({ deductible: 100000, totalIncome: 1500000 });
  assert.equal(r.threshold, 75000);
  assert.equal(r.amount, 25000);
});

test("medicalDeduction: 上限200万円", () => {
  assert.equal(medicalDeduction({ deductible: 5000000 }).amount, 2000000);
});

test("selfMedDeduction: 12,000円超、上限88,000円", () => {
  assert.equal(selfMedDeduction({ selfMed: 30000 }).amount, 18000);
  assert.equal(selfMedDeduction({ selfMed: 200000 }).amount, 88000);
  assert.equal(selfMedDeduction({ selfMed: 10000 }).amount, 0);
  assert.equal(selfMedDeduction({ selfMed: 30000, qualifies: false }).amount, 0);
});

test("estimateTaxSaving: 所得税率10%・住民税10%", () => {
  const r = estimateTaxSaving(50000, 0.1);
  assert.equal(r.incomeTax, 5105);
  assert.equal(r.residentTax, 5000);
  assert.equal(r.total, 10105);
});

test("compareDeductions: OTC中心の世帯はセルフメディケーション税制が有利", () => {
  const summary = summarize([
    { memberId: "a", category: "insured", amount: 40000 },
    { memberId: "a", category: "otc", amount: 60000, treatment: true, selfmedMark: true },
  ]);
  const r = compareDeductions({ summary, reimbursed: 0, incomeTaxRate: 0.1, selfMedQualifies: true });
  assert.equal(r.medical.amount, 0);
  assert.equal(r.selfMed.amount, 48000);
  assert.equal(r.better, "selfMed");
});

test("compareDeductions: 何も控除できないときは none", () => {
  const r = compareDeductions({ summary: summarize([]), incomeTaxRate: 0.1, selfMedQualifies: true });
  assert.equal(r.better, "none");
});

test("specialFee: 価格差の1/2＋消費税", () => {
  // 先発100円・後発60円・30錠：差額40円×30×1/2=600円、税込660円
  assert.equal(specialFee({ brandPrice: 100, genericPrice: 60, quantity: 30 }).fee, 660);
  // 2026年5月までの1/4
  assert.equal(specialFee({ brandPrice: 100, genericPrice: 60, quantity: 30, ratio: 0.25 }).fee, 330);
  assert.equal(specialFee({ brandPrice: 50, genericPrice: 60, quantity: 30 }).fee, 0);
  // 後発薬価が未入力なら計算しない（空欄を0円扱いにして差額を膨らませない）
  assert.equal(specialFee({ brandPrice: 100, genericPrice: "", quantity: 30 }).fee, 0);
});

console.log(`\n${n} tests passed`);
