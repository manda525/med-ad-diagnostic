import Head from "next/head";
import Link from "next/link";

const rows = [
  { label: "販売事業者", value: "橋詰昌" },
  { label: "運営統括責任者", value: "橋詰昌" },
  { label: "所在地", value: "請求があったら遅滞なく開示します" },
  {
    label: "電話番号",
    value: "請求があったら遅滞なく開示します（受付時間：平日10:00〜17:00）",
  },
  { label: "メールアドレス", value: "masa@med-ad-masa.com" },
  { label: "販売URL", value: "https://med-ad-diagnostic.vercel.app" },
  {
    label: "販売価格",
    value: "個人プラン 月額500円（税込）／法人プラン 月額5,000円（税込）",
  },
  {
    label: "商品代金以外の必要料金",
    value:
      "インターネット接続に必要な通信料金等はお客様のご負担となります。",
  },
  { label: "お支払い方法", value: "クレジットカード決済（Stripe）" },
  {
    label: "お支払い時期",
    value:
      "お申し込み時に初回決済。以降、毎月同日に自動更新・自動決済されます。",
  },
  {
    label: "役務の提供時期",
    value: "決済完了後、ただちにご利用いただけます。",
  },
  {
    label: "解約・返金について",
    value:
      "サブスクリプションはいつでも解約可能です（アプリ内「支払い・解約」より手続き）。解約後は、現在の請求期間の満了日までご利用いただけます。デジタルサービスの性質上、決済済み期間の日割り返金は行いません。",
  },
  {
    label: "広告表現の監修｜販売価格",
    value:
      "3円／文字（最低10,000円）＋消費税10%。依頼の作成時に原稿の文字数から確定し、お支払い画面に税込額を表示します。",
  },
  {
    label: "広告表現の監修｜お支払い方法・時期",
    value:
      "クレジットカード決済（Stripe）。依頼の作成後、表示されるお支払い画面で、1件ごとにお支払いいただきます。",
  },
  {
    label: "広告表現の監修｜役務の提供時期",
    value:
      "お支払いの確認後、お客様が原稿をメールでお送りくださってから2営業日（平日。土日祝日・年末年始を除く）を目安に、メールで納品します。原稿の分量や内容により前後する場合があります。",
  },
  {
    label: "広告表現の監修｜キャンセル・返金",
    value:
      "原稿の確認に着手する前（依頼の状況が「お支払い待ち」「受付済み」の間）は、メールでご連絡いただければ、お支払い済みの全額を返金します。確認に着手した後（「確認中」以降）は、役務の性質上、返金はできません。当方の都合で納品できない場合は、全額を返金します。返金はお支払い時のカードへ行い、反映までの期間はカード会社により異なります。",
  },
  {
    label: "動作環境",
    value: "最新版の主要ブラウザ（Chrome / Safari / Edge 等）",
  },
];

export default function Tokushoho() {
  return (
    <>
      <Head>
        <title>特定商取引法に基づく表記 | 薬機レーダー</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={styles.container}>
        <Link href="/" style={styles.backLink}>
          ← 診断ツールに戻る
        </Link>
        <h1 style={styles.h1}>特定商取引法に基づく表記</h1>
        <table style={styles.table}>
          <tbody>
            {rows.map(({ label, value }) => (
              <tr key={label}>
                <th style={styles.th}>{label}</th>
                <td style={styles.td}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={styles.footer}>制定日：2026年6月28日／改定：2026年11月（広告表現の監修を追加）</p>
      </div>
    </>
  );
}

const styles = {
  container: {
    maxWidth: 760,
    margin: "0 auto",
    padding: "40px 24px 64px",
    color: "var(--color-text-primary)",
    lineHeight: 1.8,
    fontFamily: "sans-serif",
  },
  backLink: {
    display: "inline-block",
    marginBottom: 24,
    color: "var(--color-text-secondary)",
    textDecoration: "none",
    fontSize: 14,
  },
  h1: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 32,
    borderBottom: "1px solid var(--color-border-tertiary)",
    paddingBottom: 12,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    verticalAlign: "top",
    padding: "12px 16px 12px 0",
    fontWeight: 600,
    fontSize: 14,
    color: "var(--color-text-secondary)",
    borderBottom: "1px solid var(--color-border-tertiary)",
    whiteSpace: "nowrap",
    width: "30%",
  },
  td: {
    textAlign: "left",
    verticalAlign: "top",
    padding: "12px 0",
    fontSize: 14,
    borderBottom: "1px solid var(--color-border-tertiary)",
  },
  footer: {
    marginTop: 40,
    fontSize: 13,
    color: "var(--color-text-secondary)",
  },
};
