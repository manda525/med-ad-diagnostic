import Head from "next/head";
import App from "../MedAdDiagnosticV5";

const SITE_URL = "https://med-ad-diagnostic.vercel.app";
const TITLE = "医療広告リスク診断ツール｜医療広告コンサル まさ";
const DESC =
  "広告文を貼り付けるだけで、薬機法・景表法・医療広告ガイドラインの観点からリスク箇所と修正案を一次診断。薬剤師×医療広告コンサルタントが設計した491件の現場ルールで照合します。";
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
        <meta property="og:site_name" content="医療広告リスク診断ツール" />
        <meta property="og:locale" content="ja_JP" />

        {/* Twitter (X) Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@zero89314" />
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
        <div style={{marginTop:8}}>© 2026 橋詰昌</div>
      </footer>
    </>
  );
}
