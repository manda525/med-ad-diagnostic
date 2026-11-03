#!/usr/bin/env node
// 監修の依頼の一覧と、状態の更新（運営用）。
//
//   SUPERVISE_ADMIN_TOKEN=... node scripts/supervise-admin.mjs list [--status paid]
//   SUPERVISE_ADMIN_TOKEN=... node scripts/supervise-admin.mjs set SV-XXXX-XXXX-XXXX reviewing
//   SUPERVISE_ADMIN_TOKEN=... node scripts/supervise-admin.mjs set SV-XXXX-XXXX-XXXX delivered --note "納品メール送付"
//
// 状態は reviewing（確認中）／delivered（納品済み）／cancelled（取消）。
// 「受付済み」は支払いの確認でだけ付くので、ここからは変更できない。Stripeの返金もここでは行わない。
// トークンは環境変数でだけ受け取る（コマンド履歴に残さないため）。
// 接続先は --base で変える。既定は本番。

const args = process.argv.slice(2);

function takeFlag(name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

const base = (takeFlag("base") || process.env.SUPERVISE_BASE_URL || "https://med-ad-diagnostic.vercel.app").replace(/\/$/, "");
const statusFilter = takeFlag("status");
const note = takeFlag("note");
const [command, id, to] = args;
const token = process.env.SUPERVISE_ADMIN_TOKEN;

function usage(code = 1) {
  console.error("使い方:\n  list [--status awaiting_payment|paid|reviewing|delivered|cancelled]\n  set <依頼ID> <reviewing|delivered|cancelled> [--note メモ]\n共通: --base <URL>（既定は本番）／環境変数 SUPERVISE_ADMIN_TOKEN");
  process.exit(code);
}

if (!token) {
  console.error("SUPERVISE_ADMIN_TOKEN が設定されていません。");
  usage();
}

const LABEL = {
  awaiting_payment: "お支払い待ち",
  paid: "受付済み",
  reviewing: "確認中",
  delivered: "納品済み",
  cancelled: "取消",
};

async function call(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`失敗 (${res.status}): ${body.error || res.statusText}`);
    process.exit(2);
  }
  return body;
}

const pad = (v, n) => String(v).padEnd(n, " ");

if (command === "list") {
  const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
  const { requests } = await call(`/api/supervise/admin${q}`);
  if (!requests.length) {
    console.log("該当する依頼はありません。");
  } else {
    for (const r of requests) {
      console.log(
        `${pad(r.id, 19)} ${pad(LABEL[r.status] || r.status, 8)} ${pad(`${r.length}字`, 8)} 税込¥${r.total}  ${r.industryLabel}／${r.mediaLabel || "未指定"}  ${new Date(r.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false })}`
      );
    }
  }
} else if (command === "set" && id && to) {
  const r = await call("/api/supervise/admin", { method: "POST", body: JSON.stringify({ id, to, note }) });
  console.log(`${r.id} → ${LABEL[r.status] || r.status}`);
} else {
  usage();
}
