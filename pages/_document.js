import { Html, Head, Main, NextScript } from "next/document";

// Google Search Console の所有権確認タグ。
// 確認用の content 値は秘密情報ではない（HTMLに公開される値）ので、定数に直接持つ。
// 2026-09-07 まさが Search Console で発行した値（プロパティ: https://med-ad-diagnostic.vercel.app/）。
// Vercel の環境変数 NEXT_PUBLIC_GSC_VERIFICATION を設定した場合はそちらを優先する。
const GSC_VERIFICATION = process.env.NEXT_PUBLIC_GSC_VERIFICATION || "6F8V9kIi0dNsRuwIKH0622xKg_OaDMfgyevkhkKlbyw";

export default function Document() {
  return (
    <Html lang="ja">
      <Head>
        {GSC_VERIFICATION && <meta name="google-site-verification" content={GSC_VERIFICATION} />}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
