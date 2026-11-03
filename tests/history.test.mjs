// 診断履歴（lib/history.js）と失敗の分類（lib/failure.js）の回帰テスト。
// ブラウザには触れない。保存先は偽の storage に差し替える。

import assert from "node:assert/strict";
import { classifyFailure, RECORDED_FAILURE_KINDS } from "../lib/failure.js";
import {
  HISTORY_KEY, HISTORY_MAX, HISTORY_MAX_CHARS,
  getStorage, readHistory, writeHistory, clearHistory, addEntry, removeEntry,
  buildDoneEntry, buildFailedEntry, entryToResult, newEntryId, trimToLimits,
} from "../lib/history.js";

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};

// 偽の localStorage。maxChars を超える書き込みは QuotaExceededError にする。
class FakeStorage {
  constructor({ maxChars = Infinity } = {}) { this.m = new Map(); this.maxChars = maxChars; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    if (String(v).length > this.maxChars) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; }
    this.m.set(k, String(v));
  }
  removeItem(k) { this.m.delete(k); }
}

const ctx = { industry: "E", sub: "supp", media: "lp" };
const result = (n = 1) => ({
  analysis: { final_judgment: "要修正", risk_score: 60, summary: "要約".repeat(n), risk_items: [] },
  matches: [{ id: 1, ng: "ng", risk: 80 }],
  matchCount: 1,
  laws: [{ id: "L-YAKKI-66", title: "薬機法", article: "66条", source_urls: ["https://example.test"] }],
  engine: { model: "m", rulebook: "v1/1" },
  usage: { used: 1, limit: 5, remaining: 4, pro: false }, // 履歴には残さない値
});
const done = (i, text = "広告文", n = 1) =>
  buildDoneEntry({ context: ctx, text, result: result(n), now: Date.UTC(2026, 10, 3, 0, 0, i) });

console.log("\n[失敗の分類]");
const cases = [
  [{ status: 402 }, "limit", true],
  [{ status: 429 }, "busy", true],
  [{ status: 422 }, "refused", true],
  [{ status: 504 }, "timeout", true],
  [{ status: 502 }, "parse", true],
  [{ status: 400, message: "広告文が空です。" }, "input", true],
  [{ status: 503 }, "config", true],
  [{ status: 500, message: "boom" }, "system", true],
  [{ status: 529 }, "system", true],
  [{ network: true }, "network", false],
];
for (const [input, kind, notConsumed] of cases) {
  t(`${JSON.stringify(input)} → ${kind}（回数は消費していない=${notConsumed}）`, () => {
    const f = classifyFailure(input);
    assert.equal(f.kind, kind);
    assert.equal(f.notConsumed, notConsumed);
    assert.ok(f.label.length > 0 && f.hint.length > 0);
  });
}
t("通信エラーでは「回数は消費していません」と断定しない", () => {
  assert.equal(classifyFailure({ network: true }).notConsumed, false);
});
t("入力エラーの案内はサーバーのメッセージをそのまま使う", () => {
  assert.equal(classifyFailure({ status: 400, message: "長すぎます" }).hint, "長すぎます");
});
t("system の詳細は120字に切る", () => {
  assert.equal(classifyFailure({ status: 500, message: "x".repeat(500) }).detail.length, 120);
});
t("履歴に残す失敗は、診断が始まったものだけ（上限・入力は残さない）", () => {
  assert.equal(RECORDED_FAILURE_KINDS.has("limit"), false);
  assert.equal(RECORDED_FAILURE_KINDS.has("input"), false);
  assert.equal(RECORDED_FAILURE_KINDS.has("timeout"), true);
});

console.log("\n[履歴の保存と読み出し]");
t("保存して読み戻せる（新しい順）", () => {
  const s = new FakeStorage();
  const list = [done(2), done(1)];
  writeHistory(s, list);
  const back = readHistory(s);
  assert.equal(back.length, 2);
  assert.ok(back[0].at > back[1].at);
});
t("再表示に要らない usage は履歴に残さない", () => {
  const e = done(1);
  assert.equal("usage" in e.result, false);
  assert.equal(entryToResult(e).analysis.final_judgment, "要修正");
});
t("失敗の記録は結果を持たず、種類と見出しを持つ", () => {
  const e = buildFailedEntry({ context: ctx, text: "広告文", failure: classifyFailure({ status: 504 }), now: Date.UTC(2026, 10, 3) });
  assert.equal(e.status, "failed");
  assert.equal(e.failure.kind, "timeout");
  assert.equal("result" in e, false);
  assert.equal(entryToResult(e), null);
});
t("壊れたJSONは空として扱い、例外を出さない", () => {
  const s = new FakeStorage();
  s.setItem(HISTORY_KEY, "{not json");
  assert.deepEqual(readHistory(s), []);
});
t("配列でない値は空として扱う", () => {
  const s = new FakeStorage();
  s.setItem(HISTORY_KEY, JSON.stringify({ a: 1 }));
  assert.deepEqual(readHistory(s), []);
});
t("形の合わない項目は読み飛ばす", () => {
  const s = new FakeStorage();
  s.setItem(HISTORY_KEY, JSON.stringify([done(1), { id: "x" }, null, 5, { ...done(2), status: "unknown" }]));
  assert.equal(readHistory(s).length, 1);
});
t(`件数は${HISTORY_MAX}件まで（古いものから落ちる）`, () => {
  let list = [];
  for (let i = 0; i < HISTORY_MAX + 10; i++) list = addEntry(list, done(i));
  const saved = writeHistory(new FakeStorage(), list);
  assert.equal(saved.length, HISTORY_MAX);
  assert.equal(saved[0].at, done(HISTORY_MAX + 9).at);
});
t("容量の目安を超えたら古いものから落とす", () => {
  const big = "あ".repeat(8000);
  let list = [];
  for (let i = 0; i < 50; i++) list = addEntry(list, done(i, big, 15000)); // 1件あたり約38,000字 → 50件で上限超え
  const trimmed = trimToLimits(list);
  assert.ok(trimmed.length < 50);
  assert.ok(JSON.stringify(trimmed).length <= HISTORY_MAX_CHARS);
  assert.equal(trimmed[0].at, list[0].at); // 新しい側は残る
});
t("保存先の容量が足りないときは、古いものを落として再試行する", () => {
  const one = JSON.stringify([done(1)]).length;
  const s = new FakeStorage({ maxChars: Math.floor(one * 2.5) });
  const saved = writeHistory(s, [done(5), done(4), done(3), done(2), done(1)]);
  assert.ok(saved.length >= 1 && saved.length < 5);
  assert.equal(readHistory(s).length, saved.length);
  assert.equal(saved[0].at, done(5).at);
});
t("1件も書けない容量なら空を返し、壊れた中身を残さない", () => {
  const s = new FakeStorage({ maxChars: 10 });
  assert.deepEqual(writeHistory(s, [done(1)]), []);
  assert.equal(s.getItem(HISTORY_KEY), null);
});
t("保存先が無い環境（プライベートモード等）でも例外を出さず、一覧は返す", () => {
  assert.equal(writeHistory(null, [done(1)]).length, 1);
  assert.deepEqual(readHistory(null), []);
  clearHistory(null);
});
t("node には window が無いので getStorage() は null", () => {
  assert.equal(getStorage(), null);
});
t("削除と全削除", () => {
  const s = new FakeStorage();
  const a = done(1), b = done(2);
  let list = writeHistory(s, [b, a]);
  list = writeHistory(s, removeEntry(list, a.id));
  assert.equal(list.length, 1);
  clearHistory(s);
  assert.deepEqual(readHistory(s), []);
});
t("同じ id は重複せず先頭に置き直す", () => {
  const a = done(1);
  const list = addEntry(addEntry([], a), a);
  assert.equal(list.length, 1);
});
t("id は時刻と乱数から作り、重複しにくい", () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) ids.add(newEntryId(Date.now()));
  assert.ok(ids.size > 490);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
