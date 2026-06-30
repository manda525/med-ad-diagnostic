import Head from "next/head";
import Link from "next/link";

const articles = [
  {
    heading: "第1条（適用）",
    body: "本規約は、橋詰昌（以下「当方」）が提供する「医療広告リスク診断ツール」（以下「本サービス」）の利用条件を定めるものです。",
  },
  {
    heading: "第2条（本サービスの性質・免責）",
    body: [
      "1. 本サービスは、薬機法・景品表示法・医療広告ガイドライン等の観点から広告文のリスク箇所を示す「一次診断」を提供するものであり、法的助言・適法性の保証・行政手続の代行を行うものではありません。",
      "2. 本サービスの診断結果は参考情報であり、最終的な適否判断はお客様自身および専門家による監修で行ってください。",
      "3. 当方は、本サービスの利用または診断結果への依拠により生じたいかなる損害についても、当方の故意・重過失による場合を除き責任を負いません。",
    ],
  },
  {
    heading: "第3条（料金・支払い）",
    body: [
      "1. 利用料金および支払方法は、本サービス上または特定商取引法に基づく表記に定めるとおりとします。",
      "2. サブスクリプションは毎月自動更新され、登録の決済手段に自動課金されます。",
    ],
  },
  {
    heading: "第4条（解約）",
    body: "お客様はいつでも解約できます。解約後は現在の請求期間満了日まで利用でき、日割り返金は行いません。",
  },
  {
    heading: "第5条（禁止事項）",
    body: "法令違反、当方や第三者の権利侵害、リバースエンジニアリング、不正アクセス、本サービスの再販、自動化による過度なリクエスト等を禁止します。",
  },
  {
    heading: "第6条（提供の停止・変更・終了）",
    body: "当方は、事前告知のうえ（緊急時は事後）、本サービスの内容変更・一時停止・終了ができるものとします。",
  },
  {
    heading: "第7条（知的財産権）",
    body: "本サービスおよびルールブック等に関する知的財産権は当方に帰属します。",
  },
  {
    heading: "第8条（準拠法・管轄）",
    body: "本規約は日本法に準拠し、本サービスに関する紛争は運営者の住所地を管轄する裁判所を専属的合意管轄とします。",
  },
];

export default function Terms() {
  return (
    <>
      <Head>
        <title>利用規約 | 医療広告リスク診断ツール</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={styles.container}>
        <Link href="/" style={styles.backLink}>
          ← 診断ツールに戻る
        </Link>
        <h1 style={styles.h1}>利用規約</h1>
        {articles.map(({ heading, body }) => (
          <section key={heading} style={styles.section}>
            <h2 style={styles.h2}>{heading}</h2>
            {Array.isArray(body) ? (
              body.map((line, i) => (
                <p key={i} style={styles.p}>
                  {line}
                </p>
              ))
            ) : (
              <p style={styles.p}>{body}</p>
            )}
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
    margin: "0 0 8px",
    fontSize: 14,
  },
  footer: {
    marginTop: 40,
    fontSize: 13,
    color: "var(--color-text-secondary)",
  },
};
