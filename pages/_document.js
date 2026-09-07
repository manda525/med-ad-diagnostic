import { Html, Head, Main, NextScript } from "next/document";

// Google Search Console の所有権確認タグ。
// 確認用の content 値は秘密情報ではない（HTMLに公開される値）ので、環境変数かここの定数で持てる。
// 手順：Search Console → プロパティを追加（URLプレフィックス）→ HTMLタグ → content="..." の中身を
//       NEXT_PUBLIC_GSC_VERIFICATION（Vercel）に設定するか、下の定数に貼って push する。
const GSC_VERIFICATION = process.env.NEXT_PUBLIC_GSC_VERIFICATION || "";

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
