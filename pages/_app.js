import "../styles/globals.css";
import { Analytics } from "@vercel/analytics/next";

// Vercel Web Analytics：ページビューだけを計測する。個人情報や入力内容は送らない。
// Vercel ダッシュボード側で Web Analytics を有効にしないとデータは集まらない。
export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
