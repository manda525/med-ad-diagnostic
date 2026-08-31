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

export function buildSubject({ industryLabel, length, fee }) {
  return `【監修申込】${industryLabel || ""} / ${length}文字 / ¥${fee.toLocaleString()}`;
}

export function buildMetaLines({ industryLabel, subLabel, mediaLabel, judgment, riskScore, length, fee }) {
  return [
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
