import Script from "next/script";
import "../styles/globals.css";
import { GA_ID } from "../lib/track";

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      {/* 測定IDが未設定のときは読み込まない。ID発行前でも本体は動く */}
      {GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
              gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </>
      )}
      <Component {...pageProps} />
    </>
  );
}
