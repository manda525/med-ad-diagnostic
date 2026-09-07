import Head from "next/head";
import Link from "next/link";
import { HhShell } from "../../components/HhShell";
import s from "../../styles/hh.module.css";
import { GUIDES } from "../../data/guides";

const SITE_URL = "https://med-ad-diagnostic.vercel.app";

export default function GuideIndex() {
  return (
    <HhShell current="guide">
      <Head>
        <title>解説｜医療費控除・特別の料金・処方か市販薬か | 世帯の医療費計算機</title>
        <meta name="description" content="マイナポータルに載らない医療費、先発品の特別の料金、OTC類似薬、処方か市販薬か。家計の医療費に関わる制度を薬剤師が一次情報つきで解説します。" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`${SITE_URL}/guide`} />
      </Head>
      <div className={s.hero}>
        <div>
          <h1 className={s.h1}>家計の医療費に関わる制度の<em>解説</em></h1>
          <p className={s.lead}>数値と制度は一次情報（国税庁・厚生労働省）に当たり、確認日を添えています。各ページの末尾から、該当する計算機に進めます。</p>
        </div>
      </div>
      <div className={s.catGrid}>
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/guide/${g.slug}`} className={s.cat} style={{ textDecoration: "none" }}>
            <span className={s.catTitle}>{g.title}</span>
            <span className={s.help}>{g.desc}</span>
            <span className={s.help} style={{ color: "var(--ink-3)" }}>更新 {g.updated}</span>
          </Link>
        ))}
      </div>
    </HhShell>
  );
}
