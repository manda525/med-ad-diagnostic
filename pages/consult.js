import Head from "next/head";
import Link from "next/link";

const CONTACT_EMAIL = "masa@med-ad-masa.com";
const LINE_URL = "https://lin.ee/7GlM6CT";

const services = [
  {
    title: "単発の広告文チェック",
    desc: "広告文・LPの一部をスポットで精査します。薬機法・景表法・医療広告ガイドラインの観点からリスク箇所を洗い出し、NG→OKの書き換え方向まで返します。",
  },
  {
    title: "LP・記事の全文レビュー",
    desc: "1本を丸ごと精査します。部分的なチェックでは拾いきれない、訴求全体の整合や文脈まで含めて確認します。",
  },
  {
    title: "継続監修契約（月額）",
    desc: "継続的にチェックと相談へ対応します。発信のスピードを止めずに、守りを固めたい事業者向けです。",
  },
  {
    title: "記事の執筆・監修",
    desc: "医療・健康・薬剤師領域の記事について、執筆または監修を行います。薬機法に配慮した表現で、信頼できるコンテンツに仕上げます。",
  },
];

export default function Consult() {
  return (
    <>
      <Head>
        <title>広告監修・コンサルティングのご案内 | 医療広告リスク診断ツール</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={styles.container}>
        <Link href="/" style={styles.backLink}>
          ← 診断ツールに戻る
        </Link>
        <h1 style={styles.h1}>広告監修・コンサルティングのご案内</h1>
        <p style={styles.lead}>
          無料の一次診断で当たりをつけたあと、最終的な適否は人の目で詰める必要があります。薬剤師／薬機法管理者／景表法第1級として、広告代理店・メーカー・医療機関の案件に向き合ってきた経験から、守りの部分をご一緒します。
        </p>

        <div style={styles.grid}>
          {services.map((s) => (
            <div key={s.title} style={styles.card}>
              <h2 style={styles.cardTitle}>{s.title}</h2>
              <p style={styles.cardDesc}>{s.desc}</p>
              <p style={styles.price}>料金：内容に応じてお見積もり</p>
            </div>
          ))}
        </div>

        <div style={styles.ctaBox}>
          <p style={styles.ctaLead}>
            まずはお気軽にご相談ください。案件の内容をうかがったうえで、お見積もりします。
          </p>
          <div style={styles.ctaRow}>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=広告監修・コンサルティングのご相談&body=【ご相談内容】%0A%0A【業種・商材】%0A%0A【媒体】%0A%0A【ご希望・ご予算感】`}
              style={styles.mailBtn}
            >
              📧 メールで相談
            </a>
            <a href={LINE_URL} target="_blank" rel="noopener noreferrer" style={styles.lineBtn}>
              💬 LINEで相談
            </a>
          </div>
        </div>

        <p style={styles.note}>
          運営：医療広告コンサル まさ（薬剤師／薬機法管理者／景表法第1級／YMAA・KTAA認証）。診断ツールは一次チェックであり、最終的な適否判断は監修で詰めます。
        </p>
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
    marginBottom: 16,
    borderBottom: "1px solid var(--color-border-tertiary)",
    paddingBottom: 12,
  },
  lead: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
    margin: "0 0 28px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
    gap: 14,
    marginBottom: 28,
  },
  card: {
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-lg)",
    padding: "16px 18px",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 600,
    margin: "0 0 8px",
    color: "var(--color-text-primary)",
  },
  cardDesc: {
    fontSize: 13,
    color: "var(--color-text-secondary)",
    margin: "0 0 10px",
    lineHeight: 1.8,
  },
  price: {
    fontSize: 12,
    color: "var(--color-text-info)",
    margin: 0,
    fontWeight: 500,
  },
  ctaBox: {
    background: "var(--color-background-info)",
    border: "0.5px solid var(--color-border-info)",
    borderRadius: "var(--border-radius-lg)",
    padding: "18px 20px",
    marginBottom: 24,
  },
  ctaLead: {
    fontSize: 13,
    color: "var(--color-text-primary)",
    margin: "0 0 14px",
    lineHeight: 1.8,
  },
  ctaRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  mailBtn: {
    fontSize: 14,
    padding: "10px 22px",
    borderRadius: "var(--border-radius-md)",
    background: "var(--color-background-primary)",
    color: "var(--color-text-info)",
    border: "0.5px solid var(--color-border-info)",
    textDecoration: "none",
    fontWeight: 500,
  },
  lineBtn: {
    fontSize: 14,
    padding: "10px 22px",
    borderRadius: "var(--border-radius-md)",
    background: "#06C755",
    color: "#fff",
    border: "0.5px solid #06C755",
    textDecoration: "none",
    fontWeight: 500,
  },
  note: {
    fontSize: 12,
    color: "var(--color-text-secondary)",
    margin: 0,
    lineHeight: 1.8,
  },
};
