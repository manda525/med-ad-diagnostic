import Head from "next/head";
import Link from "next/link";

const sections = [
  {
    heading: "1. 取得する情報",
    body: [
      "・お客様が診断のために入力した広告文等のテキスト",
      "・利用状況（診断回数、選択した業種等）",
      "・アクセス元のIPアドレス　※不正な大量利用の防止のためにのみ用います。保存にあたっては元のアドレスを復元できない形に変換し、最長でも24時間で消去します。",
      "・決済に関する情報　※カード番号等の決済情報は決済代行会社（Stripe）が処理し、当方はカード番号を保持しません。",
      "・監修のご依頼の情報（依頼ID、原稿の文字数、業種・媒体、AIの一次判定、金額、状態）。原稿の本文とメールアドレスは、当方のデータベースには保存しません。原稿はお客様がメールでお送りいただき、当方のメールに保管されます。お支払いに使われたメールアドレスは、決済代行会社（Stripe）が保持します。",
    ],
  },
  {
    heading: "2. 利用目的",
    body: [
      "・本サービス（広告文の診断）の提供",
      "・お問い合わせ対応、サービス改善",
      "・監修のご依頼の受付、お支払いの確認、状況のご案内、納品",
    ],
  },
  {
    heading: "3. 外部サービスへのデータ送信",
    body: [
      "本サービスは診断のため、入力された広告文を以下の外部サービスに送信します。",
      "・Anthropic（AI診断の処理）",
      "・Stripe（決済処理）",
      "監修のご依頼の情報（原稿の本文は含みません）の保管には、データベースサービス（Upstash）を使います。依頼の情報は、依頼から約13か月保管し、その後に消去します。",
      "機密情報・個人を特定できる情報を診断欄に入力しないようご注意ください。",
    ],
  },
  {
    heading: "4. Cookie・ローカルストレージ",
    body: [
      "・無料利用回数の管理のため、ランダムな識別子のみを含むCookieを保存します（有効期間1年）。氏名・メールアドレス等の個人を特定する情報は含みません。",
      "・ご契約状態の保持のため、ブラウザのローカルストレージを使用します。",
      "・診断履歴の表示のため、診断した広告文と結果を、ブラウザのローカルストレージに保存します。この履歴はお使いの端末の中にだけ保存され、履歴を残すために広告文や結果を当方のサーバーへ送信することはありません。履歴画面の「削除」または「履歴をすべて削除」で、いつでも消せます。",
      "・監修を依頼されたとき、お支払い後に原稿をメールで送る手間を省くため、依頼IDと原稿をブラウザのローカルストレージに保存します。この内容はお使いの端末の中にだけ保存され、依頼の状況画面の「この端末から消す」で消せます。",
      "・不正な大量利用を制限するため、変換済みのアクセス元情報を一時的に保存します。短時間の集中アクセスの判定に用いるものは約10分、1日あたりの利用回数の判定に用いるものは約24時間で消去します。",
      "Cookieはブラウザの設定で削除できます。削除された場合、無料利用回数の記録も失われます。",
    ],
  },
  {
    heading: "5. 開示・訂正・削除",
    body: [
      "お客様からの開示・訂正・削除のご請求には、本人確認のうえ法令に従い対応します。",
    ],
  },
  {
    heading: "6. お問い合わせ窓口",
    body: ["橋詰昌　メール：masa@med-ad-masa.com"],
  },
];

export default function Privacy() {
  return (
    <>
      <Head>
        <title>プライバシーポリシー | 薬機レーダー</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={styles.container}>
        <Link href="/" style={styles.backLink}>
          ← 診断ツールに戻る
        </Link>
        <h1 style={styles.h1}>プライバシーポリシー</h1>
        {sections.map(({ heading, body }) => (
          <section key={heading} style={styles.section}>
            <h2 style={styles.h2}>{heading}</h2>
            {body.map((line, i) => (
              <p key={i} style={styles.p}>
                {line}
              </p>
            ))}
          </section>
        ))}
        <p style={styles.footer}>制定日：2026年6月28日</p>
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
  section: {
    marginBottom: 28,
  },
  h2: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8,
    color: "var(--color-text-primary)",
  },
  p: {
    margin: "0 0 6px",
    fontSize: 14,
  },
  footer: {
    marginTop: 40,
    fontSize: 13,
    color: "var(--color-text-secondary)",
  },
};
