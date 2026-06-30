import Head from "next/head";
import Link from "next/link";

const sections = [
  {
    heading: "1. 取得する情報",
    body: [
      "・お客様が診断のために入力した広告文等のテキスト",
      "・利用状況（診断回数、選択した業種等）",
      "・決済に関する情報　※カード番号等の決済情報は決済代行会社（Stripe）が処理し、当方はカード番号を保持しません。",
    ],
  },
  {
    heading: "2. 利用目的",
    body: [
      "・本サービス（広告文の診断）の提供",
      "・お問い合わせ対応、サービス改善",
    ],
  },
  {
    heading: "3. 外部サービスへのデータ送信",
    body: [
      "本サービスは診断のため、入力された広告文を以下の外部サービスに送信します。",
      "・Anthropic（AI診断の処理）",
      "・Stripe（決済処理）",
      "機密情報・個人を特定できる情報を診断欄に入力しないようご注意ください。",
    ],
  },
  {
    heading: "4. Cookie・ローカルストレージ",
    body: [
      "利用回数や利用状態の保持のため、ブラウザのローカルストレージを使用します。",
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
        <title>プライバシーポリシー | 医療広告リスク診断ツール</title>
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
