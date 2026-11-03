// 診断履歴。この端末のブラウザ（localStorage）にだけ保存する。サーバーには送らない。
//
// 広告原稿は取引先の機密にあたることがあるため、サーバー側には履歴を持たない。
// その代わり、履歴はブラウザごと（スマホとPCでは共有されない）で、利用者が消せる。
//
// このファイルは window に触れない純粋な関数と、保存先（storage）を引数で受ける関数だけで構成する。
// 画面側は getStorage() で得た値を渡す。テストでは偽の storage を渡す。

export const HISTORY_KEY = "med_ad_history_v1";
export const HISTORY_MAX = 50;
// localStorage の上限（ブラウザにより約5MB）に余裕を残すための目安。文字数で数える。
export const HISTORY_MAX_CHARS = 1_500_000;

// 使える localStorage を返す。無い・書き込めない環境（プライベートモード等）では null。
export function getStorage() {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "__med_ad_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isValidEntry(e) {
  if (!isObject(e)) return false;
  if (typeof e.id !== "string" || typeof e.at !== "string" || typeof e.text !== "string") return false;
  if (e.status === "done") return isObject(e.result) && isObject(e.result.analysis);
  if (e.status === "failed") return isObject(e.failure) && typeof e.failure.label === "string";
  return false;
}

export function readHistory(storage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(isValidEntry)
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

// 件数と容量の上限に収める。list は新しい順。古いものから落とす。
export function trimToLimits(list) {
  let next = list.slice(0, HISTORY_MAX);
  while (next.length > 1 && JSON.stringify(next).length > HISTORY_MAX_CHARS) {
    next = next.slice(0, -1);
  }
  return next;
}

// 保存して、実際に保存できた一覧を返す。容量超過などで書けないときは古いものを落として再試行する。
// storage が無い環境では保存せず、そのまま返す（画面を開いている間だけ有効）。
export function writeHistory(storage, list) {
  let next = trimToLimits(list);
  if (!storage) return next;
  for (;;) {
    try {
      storage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    } catch {
      if (next.length <= 1) {
        try { storage.removeItem(HISTORY_KEY); } catch { /* 何もしない */ }
        return [];
      }
      next = next.slice(0, -1);
    }
  }
}

export function clearHistory(storage) {
  if (!storage) return;
  try { storage.removeItem(HISTORY_KEY); } catch { /* 何もしない */ }
}

export function addEntry(list, entry) {
  return [entry, ...list.filter((e) => e.id !== entry.id)];
}

export function removeEntry(list, id) {
  return list.filter((e) => e.id !== id);
}

export function newEntryId(now = Date.now(), rnd = Math.random) {
  const tail = Math.floor(rnd() * 36 ** 4).toString(36).padStart(4, "0");
  return `${now.toString(36)}-${tail}`;
}

function pickContext(c = {}) {
  return {
    industry: c.industry || null,
    sub: c.sub || null,
    media: c.media || null,
    clientIndustry: c.clientIndustry || null,
    clientSub: c.clientSub || null,
  };
}

// 診断APIが返した結果から、再表示に必要な分だけを残す（usage など表示に使わないものは捨てる）。
export function buildDoneEntry({ context, text, result, now = Date.now() }) {
  return {
    id: newEntryId(now),
    at: new Date(now).toISOString(),
    status: "done",
    ...pickContext(context),
    length: text.length,
    text,
    result: {
      analysis: result.analysis,
      matches: result.matches || [],
      matchCount: result.matchCount || 0,
      laws: result.laws || [],
      engine: result.engine || null,
    },
  };
}

export function buildFailedEntry({ context, text, failure, now = Date.now() }) {
  return {
    id: newEntryId(now),
    at: new Date(now).toISOString(),
    status: "failed",
    ...pickContext(context),
    length: text.length,
    text,
    failure: { kind: failure.kind, label: failure.label },
  };
}

export function entryToResult(entry) {
  if (!entry || entry.status !== "done") return null;
  const r = entry.result;
  return {
    analysis: r.analysis,
    matches: r.matches || [],
    matchCount: r.matchCount || 0,
    laws: r.laws || [],
    engine: r.engine || null,
  };
}
