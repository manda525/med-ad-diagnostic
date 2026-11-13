import Head from "next/head";
import App from "../components/DiagnosticV2";
import { RADAR_FONT_HREF } from "../components/radarTheme";

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

        {/* 書体（親サイト med-ad-masa.com と同じ3書体）。トップだけで読み込む */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={RADAR_FONT_HREF} />
      </Head>
      <main className="rd-main">
        <App />
      </main>
      <footer className="rd rd-ft">
        <div className="wrap ft-grid">
          <div>
            <a className="logo" href="https://med-ad-masa.com" target="_blank" rel="noopener noreferrer" aria-label="Pharma-Ad Lab">
              <svg viewBox="0 0 512 512" aria-hidden="true">
                <rect width="512" height="512" rx="112" fill="#0f5b4e" />
                <rect x="196" y="74" width="120" height="58" rx="16" fill="#f3f1e9" />
                <rect x="182" y="148" width="148" height="298" rx="70" fill="#f3f1e9" />
                <path d="M182 326h148v50a70 70 0 0 1-70 70h-8a70 70 0 0 1-70-70z" fill="#d4451b" />
              </svg>
              <span>Pharma<span className="ad">-Ad</span><span className="lab">Lab</span></span>
            </a>
          </div>
          <div>
            <ul>
              <li><a href="/consult">監修サービスのご案内</a></li>
              <li><a href="/household">世帯の医療費計算機（無料）</a></li>
            </ul>
          </div>
          <div>
            <ul>
              <li><a href="/tokushoho">特定商取引法に基づく表記</a></li>
              <li><a href="/terms">利用規約</a></li>
              <li><a href="/privacy">プライバシーポリシー</a></li>
            </ul>
          </div>
        </div>
        <div className="wrap ft-bottom mono">
          © 2026 <a href="https://med-ad-masa.com" target="_blank" rel="noopener noreferrer">Pharma-Ad Lab</a>
        </div>
      </footer>
    </>
  );
}
