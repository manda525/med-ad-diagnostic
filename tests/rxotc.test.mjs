// 処方かOTCか（lib/rxotc.mjs）の回帰テスト
//
//   npm run test:rxotc
//
// 純粋関数のみ。外部通信・課金なし。

import assert from "node:assert/strict";
import { drugPoints, copay, prescriptionCost, compareRxOtc, DEFAULT_POINTS } from "../lib/rxotc.mjs";

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log(`ok - ${name}`); };

test("drugPoints: 五捨五超入", () => {
  assert.equal(drugPoints(10.5, 10), 10); // 105円 → 10.5 → 切り捨て 10点
  assert.equal(drugPoints(10.8, 10), 11); // 108円 → 10.8 → 11点
  assert.equal(drugPoints(5, 1), 0); // 5円 → 0.5 → 0点
  assert.equal(drugPoints(0, 10), 0);
});

test("copay: 10円未満四捨五入", () => {
  assert.equal(copay(124, 0.3), 370); // 1240円×0.3=372 → 370
  assert.equal(copay(125, 0.3), 380); // 375 → 380
  assert.equal(copay(124, 0), 0);
});

test("prescriptionCost: 単独受診・3割・ロキソプロフェン後発10錠", () => {
  const r = prescriptionCost({ price: 10.5, quantity: 10, ratio: 0.3, standalone: true, otcLike: false });
  const clinic = 76 + 2 + 52 + 60; // 190点
  const tech = 45 + 24 + 10 + 45; // 124点
  assert.equal(r.points.clinic, clinic);
  assert.equal(r.points.pharmacyTech, tech);
  assert.equal(r.points.drug, 10);
  assert.equal(r.clinicCopay, 570); // 1900×0.3=570
  assert.equal(r.pharmacyCopay, 400); // (124+10)×10×0.3=402 → 400
  assert.equal(r.specialFee, 0);
  assert.equal(r.total, 970);
});

test("prescriptionCost: 定期受診のついでなら薬剤調剤料と薬剤料だけ", () => {
  const r = prescriptionCost({ price: 10.5, quantity: 10, ratio: 0.3, standalone: false });
  assert.equal(r.points.clinic, 0);
  assert.equal(r.points.pharmacyTech, DEFAULT_POINTS.chozai);
  assert.equal(r.total, copay(24 + 10, 0.3)); // 102 → 100
  assert.equal(r.total, 100);
});

test("prescriptionCost: OTC類似薬の特別の料金は薬剤費の1/4", () => {
  const r = prescriptionCost({ price: 10.5, quantity: 10, ratio: 0.3, standalone: true, otcLike: true });
  assert.equal(r.drugYen, 105);
  assert.equal(r.specialFee, 26);
  assert.equal(r.total, 970 + 26);
});

test("prescriptionCost: 負担0割（子ども医療費助成）でも特別の料金は残る", () => {
  const r = prescriptionCost({ price: 10.5, quantity: 10, ratio: 0, standalone: true, otcLike: true });
  assert.equal(r.clinicCopay, 0);
  assert.equal(r.pharmacyCopay, 0);
  assert.equal(r.total, 26);
});

test("prescriptionCost: 点数を上書きできる", () => {
  const r = prescriptionCost({ price: 10, quantity: 1, ratio: 0.3, standalone: true, points: { shohosen: 68 } });
  assert.equal(r.points.clinic, 76 + 2 + 52 + 68);
});

test("compareRxOtc: 単発の症状はOTCが安く、時間を入れると差が広がる", () => {
  const r = compareRxOtc({ price: 10.5, quantity: 10, ratio: 0.3, standalone: true, otcLike: false, otcPrice: 800, hours: 1.5, hourlyValue: 1000 });
  assert.equal(r.rx.total, 970);
  assert.equal(r.otc, 800);
  assert.equal(r.cheaper, "otc");
  assert.equal(r.diff, 170);
  assert.equal(r.timeCost, 1500);
  assert.equal(r.rxWithTime, 2470);
  assert.equal(r.cheaperWithTime, "otc");
});

test("compareRxOtc: 定期受診のついでなら処方が安い", () => {
  const r = compareRxOtc({ price: 10.5, quantity: 10, ratio: 0.3, standalone: false, otcPrice: 800 });
  assert.equal(r.cheaper, "rx");
  assert.equal(r.diff, 700);
});

console.log(`\n${n} tests passed`);
