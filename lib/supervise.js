// 監修申込の本文と mailto を組み立てる。
//
// mailto の URL 長は Windows のシェル経由（Outlook 等）で約2,000字が上限とされる。
// 日本語はパーセントエンコードで1文字あたり約9バイトになるため、原稿をURLに載せると
// 120字程度の短い原稿でも上限を超え、メーラーが起動しない。したがって
// 「本文全体はクリップボード／画面表示で渡し、URLには原稿を載せない」という分担にする。
//
// この分担が崩れていないことは tests/supervise.test.mjs で固定している。

export const MAILTO_SAFE_LEN = 1900;

/** 3円/字・最低受託1万円（税別） */
export function superviseFeeFor(length) {
  return Math.max(10000, Math.ceil(length * 3));
}

// requestId があるときは件名の頭に付ける（受信側で依頼と突き合わせるため）。
export function buildSubject({ industryLabel, length, fee, requestId }) {
  const head = requestId ? `【監修申込 ${requestId}】` : "【監修申込】";
  return `${head}${industryLabel || ""} / ${length}文字 / ¥${fee.toLocaleString()}`;
}

// requestId と paidTotal があるときは、先頭に依頼IDと支払い済みの旨を入れる。
export function buildMetaLines({ industryLabel, subLabel, mediaLabel, judgment, riskScore, length, fee, requestId, paidTotal }) {
  const head = requestId
    ? [
        `【依頼ID】${requestId}`,
        ...(paidTotal ? [`【お支払い】完了済み（税込 ¥${paidTotal.toLocaleString()}）`] : []),
      ]
    : [];
  return [
    ...head,
    `【業種】${industryLabel || ""}${subLabel ? `（${subLabel}）` : ""}`,
    `【媒体】${mediaLabel || "未指定"}`,
    `【AI一次判定】${judgment}（リスクスコア ${riskScore}）`,
    `【原稿の分量】${length.toLocaleString()}文字`,
    `【監修料金】¥${fee.toLocaleString()}（税別・3円/文字・最低受託¥10,000）`,
    "【希望納期】（ご記入ください）",
    "【補足・ご要望】（任意）",
  ];
}

/** メール本文へ貼り付けてもらう全文。原稿は省略しない。 */
export function buildApplyText({ metaLines, text }) {
  return [
    "薬機レーダーの診断結果から作成した、監修のお申し込みです。",
    "",
    ...metaLines,
    "",
    "----- 診断した原稿（全文） -----",
    text,
  ].join("\n");
}

/**
 * mailto の URL。原稿は載せない（載せると長さが原稿量に比例して破綻するため）。
 * 何かの拍子に上限を超えた場合は件名のみへ退避する。
 */
export function buildMailto({ email, subject }) {
  const s = encodeURIComponent(subject);
  const body = encodeURIComponent(
    [
      "薬機レーダーからの監修申込です。",
      "申込内容はコピー済みです。この下に貼り付けて送信してください。",
      "",
      "▼ ここに貼り付け（Ctrl / ⌘ + V）",
      "",
    ].join("\n")
  );
  const url = `mailto:${email}?subject=${s}&body=${body}`;
  return url.length <= MAILTO_SAFE_LEN ? url : `mailto:${email}?subject=${s}`;
}

// ---- 依頼の状態と料金（画面とサーバーで共有。Node の機能は使わない） -------------

export const STATUS = {
  AWAITING_PAYMENT: "awaiting_payment",
  PAID: "paid",
  REVIEWING: "reviewing",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
};

export const STATUS_LABEL = {
  awaiting_payment: "お支払い待ち",
  paid: "受付済み（原稿待ち）",
  reviewing: "確認中",
  delivered: "納品済み",
  cancelled: "取消",
};

const NEXT = {
  awaiting_payment: [STATUS.CANCELLED],
  paid: [STATUS.REVIEWING, STATUS.DELIVERED, STATUS.CANCELLED],
  reviewing: [STATUS.DELIVERED, STATUS.CANCELLED],
  delivered: [],
  cancelled: [],
};

export function canTransition(from, to) {
  return (NEXT[from] || []).includes(to);
}

export function isTerminal(status) {
  return status === STATUS.DELIVERED || status === STATUS.CANCELLED;
}

export const TAX_RATE_PERCENT = 10;
// 1件あたりの文字数の上限。これを超える原稿は個別に相談する（決済の金額の取り違えを避ける）。
export const MAX_LENGTH = 30000;

export function yen(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 税別の料金（3円/字・最低1万円）と、消費税（切り捨て）、税込合計。
export function feeBreakdown(length) {
  const fee = superviseFeeFor(length);
  const tax = Math.floor((fee * TAX_RATE_PERCENT) / 100);
  return { fee, tax, total: fee + tax };
}

