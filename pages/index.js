import Head from "next/head";
import App from "../components/DiagnosticV2";

const SITE_URL = "https://med-ad-diagnostic.vercel.app";
const TITLE = "薬機レーダー｜薬機法・景表法・医療広告GL AIチェック";
const DESC =
  "業種と媒体を選んで広告文を貼るだけ。薬機法・景表法・医療広告GL・獣医療法など一次ソース検証済みの法令データベースと現場ルールで、条文根拠つきのリスク診断と修正案を返します。医療・施術・美容・EC・ペットの8業種に対応。";
const OG_IMAGE = `${SITE_URL}/og-image.png`;

export default function Home() {
  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={DESC} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* OGP */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESC} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="薬機レーダー" />
        <meta property="og:locale" content="ja_JP" />

        {/* Twitter (X) Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@Pharma_Ad_Lab" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESC} />
        <meta name="twitter:image" content={OG_IMAGE} />

        <link rel="canonical" href={SITE_URL} />
      </Head>
      <main>
        <App />
      </main>
      <footer style={{textAlign:"center",padding:"32px 16px",fontSize:13,color:"var(--color-text-secondary)",borderTop:"0.5px solid var(--color-border-tertiary)",marginTop:24}}>
        <div style={{marginBottom:10}}>
          <a href="/consult" style={{color:"var(--color-text-info)",margin:"0 8px",fontWeight:500}}>監修サービスのご案内</a>
        </div>
        <a href="/tokushoho" style={{color:"var(--color-text-secondary)",margin:"0 8px"}}>特定商取引法に基づく表記</a>
        ・
        <a href="/terms" style={{color:"var(--color-text-secondary)",margin:"0 8px"}}>利用規約</a>
        ・
        <a href="/privacy" style={{color:"var(--color-text-secondary)",margin:"0 8px"}}>プライバシーポリシー</a>
        <div style={{marginTop:8}}>© 2026 Pharma-Ad Lab</div>
      </footer>
    </>
  );
}
