import Head from "next/head";
import { HhShell } from "../components/HhShell";
import s from "../styles/hh.module.css";

// 薬局・クリニック・自治体・家計メディア向け：計算機の無料埋め込み案内
const SITE_URL = "https://med-ad-diagnostic.vercel.app";
const CODE = `<iframe src="${SITE_URL}/household?embed=1" title="世帯の医療費計算機" style="width:100%;min-height:1400px;border:0;" loading="lazy"></iframe>
<p style="font-size:12px">提供：<a href="${SITE_URL}/household">世帯の医療費計算機</a>（薬剤師が設計）</p>`;

export default function Embed() {
  return (
    <HhShell current="embed">
      <Head>
        <title>計算機を自社サイトに無料で設置する | 世帯の医療費計算機</title>
        <meta name="description" content="世帯の医療費計算機と処方か市販薬かの比較計算機を、薬局・クリニック・自治体・メディアのサイトに無料で埋め込めます。コードをコピーして貼るだけ。" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`${SITE_URL}/embed`} />
      </Head>
      <div className={s.hero}>
        <div>
          <h1 className={s.h1}>計算機を、自社サイトに<em>無料で</em>設置する</h1>
          <p className={s.lead}>薬局・クリニック・自治体・家計メディアのサイトに、コードを1つ貼るだけで設置できます。患者さんや読者に「医療費通知に載らない医療費」と「処方か市販薬か」を自分で確かめてもらえます。費用・申請は不要です。</p>
        </div>
        <aside className={s.heroAside}>
          <h2>条件</h2>
          <ul>
            <li>提供元の表記（コードに含まれています）を残してください</li>
            <li>計算機の内容を改変しての再配布はご遠慮ください</li>
            <li>利用者の入力はお使いのサイトにも当サイトのサーバーにも送られません</li>
          </ul>
        </aside>
      </div>
      <section className={s.panel}>
        <div className={s.panelHead}><span className={s.kicker}>埋め込みコード</span><h2 className={s.h2}>世帯の医療費計算機</h2></div>
        <pre style={{ background: "#f7f9fc", border: "1px solid var(--line)", borderRadius: 8, padding: 14, overflowX: "auto", fontSize: 12.5, lineHeight: 1.6 }}><code>{CODE}</code></pre>
        <p className={s.help}>処方か市販薬かの計算機を設置する場合は、URL を <code>{SITE_URL}/rx-or-otc?embed=1</code> に変えてください。</p>
      </section>
      <section className={s.panel}>
        <div className={s.panelHead}><span className={s.kicker}>薬局・クリニック向け</span><h2 className={s.h2}>患者さんへの説明に</h2></div>
        <p className={s.desc}>先発品の特別の料金や、2027年のOTC類似薬の負担見直しについて、窓口で毎回説明するのは手間がかかります。院内掲示やホームページに計算機を置いておくと、患者さんが自分の薬で確かめられます。院内向けの印刷用資料が必要な場合は、<a href="/consult">お問い合わせ</a>ください。</p>
      </section>
    </HhShell>
  );
}
