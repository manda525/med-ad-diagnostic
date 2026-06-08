import Head from "next/head";
import App from "../MedAdDiagnosticV5";

export default function Home() {
  return (
    <>
      <Head>
        <title>医療広告リスク診断ツール｜医療広告コンサル まさ</title>
        <meta name="description" content="薬機法・景表法・医療広告ガイドラインに基づくAI一次診断ツール。薬剤師×医療広告コンサルタントが監修。" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main>
        <App />
      </main>
    </>
  );
}
