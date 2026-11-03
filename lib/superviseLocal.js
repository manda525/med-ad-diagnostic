// 監修の依頼で送る原稿を、この端末のブラウザ（localStorage）にだけ置いておく。
//
// 支払い画面（Stripe）へ移ると、画面の状態は消える。支払い後に戻ってきたとき、
// 原稿をメールへ貼り付ける手間をなくすために、依頼IDとひも付けて端末に残す。
// サーバーには送らない。ほかの端末では見えない（その場合はメールで原稿を送ってもらう）。
//
// window に触れる部分は getStorage()（lib/history.js）だけ。ここの関数は保存先を引数で受ける。

import { getStorage } from "./history";

export { getStorage };

export const SUP_LOCAL_KEY = "med_ad_supervise_v1";
export const SUP_LOCAL_MAX = 20;

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isValid(e) {
  return isObject(e) && typeof e.id === "string" && typeof e.createdAt === "string" &&
    typeof e.text === "string" && isObject(e.meta);
}

export function readLocal(storage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SUP_LOCAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(isValid)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, SUP_LOCAL_MAX);
  } catch {
    return [];
  }
}

function write(storage, list) {
  let next = list.slice(0, SUP_LOCAL_MAX);
  for (;;) {
    try {
      storage.setItem(SUP_LOCAL_KEY, JSON.stringify(next));
      return true;
    } catch {
      if (next.length <= 1) {
        try { storage.removeItem(SUP_LOCAL_KEY); } catch { /* 何もしない */ }
        return false;
      }
      next = next.slice(0, -1); // 容量超過のときは古いものから落として再試行
    }
  }
}

// 同じIDがあれば置き換える。保存できたら true。
export function saveLocal(storage, entry) {
  if (!storage || !isValid(entry)) return false;
  const rest = readLocal(storage).filter((e) => e.id !== entry.id);
  return write(storage, [entry, ...rest]);
}

export function getLocal(storage, id) {
  return readLocal(storage).find((e) => e.id === id) || null;
}

export function removeLocal(storage, id) {
  if (!storage) return;
  write(storage, readLocal(storage).filter((e) => e.id !== id));
}
