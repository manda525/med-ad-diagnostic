import Head from "next/head";
import Link from "next/link";
import { HhShell } from "../../components/HhShell";
import s from "../../styles/hh.module.css";
import { GUIDES, GUIDE_MAP } from "../../data/guides";

const SITE_URL = "https://med-ad-diagnostic.vercel.app";

export default function Guide({ slug }) {
  const g = GUIDE_MAP[slug];
  const url = `${SITE_URL}/guide/${g.slug}`;
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: g.title,
      description: g.desc,
      dateModified: g.updated,
      author: { "@type": "Organization", name: "Pharma-Ad Lab" },
      publisher: { "@type": "Organization", name: "Pharma-Ad Lab" },
      mainEntityOfPage: url,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];
  const others = GUIDES.filter((x) => x.slug !== g.slug).slice(0, 3);
  return (
    <HhShell current="guide">
      <Head>
        <title>{g.title} | 世帯の医療費計算機</title>
        <meta name="description" content={g.desc} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={url} />
        <meta property="og:title" content={g.title} />
        <meta property="og:description" content={g.desc} />
        <meta property="og:image" content={`${SITE_URL}/og-image.png`} />
        <meta property="og:site_name" content="薬機レーダー" />
        <meta property="og:locale" content="ja_JP" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      </Head>
      <article>
        <p className={s.kicker} style={{ marginBottom: 6 }}>解説</p>
        <h1 className={s.h1}>{g.title}</h1>
        <p className={s.lead}>{g.desc}</p>
        <p className={s.help}>薬剤師（薬機法管理者）が執筆。更新 {g.updated}</p>
        {g.sections.map((sec) => (
          <section key={sec.h} className={s.panel} style={{ marginTop: 16 }}>
            <h2 className={s.h2} style={{ marginBottom: 10 }}>{sec.h}</h2>
            {sec.p.map((t, i) => <p key={i} style={{ fontSize: 15, margin: "0 0 10px", lineHeight: 1.9 }}>{t}</p>)}
          </section>
        ))}
        <section className={s.panel} style={{ background: "var(--mint-bg)", borderColor: "var(--mint-line)" }}>
          <div className={s.panelHead}><span className={s.kicker} style={{ color: "var(--mint-deep)" }}>計算機</span><h2 className={s.h2}>自分の世帯で確かめる</h2></div>
          <Link href={g.tool.href} className={s.btnMint}>{g.tool.label} →</Link>
        </section>
        {g.faq.length > 0 && (
          <section className={s.panel}>
            <h2 className={s.h2} style={{ marginBottom: 10 }}>よくある質問</h2>
            {g.faq.map((f) => (
              <div key={f.q} style={{ marginBottom: 12 }}>
                <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{f.q}</p>
                <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.8 }}>{f.a}</p>
              </div>
            ))}
          </section>
        )}
        <section className={s.basis}>
          <h2>出典と確認日</h2>
          <ul>{g.sources.map((src) => <li key={src.u}><a href={src.u} target="_blank" rel="noopener noreferrer">{src.t}</a>（確認日 {g.updated}）</li>)}</ul>
          <p className={s.help} style={{ marginTop: 10 }}>この解説は制度と費用の情報提供で、税務・医療の個別の判断を代替するものではありません。</p>
        </section>
        <section style={{ marginTop: 16 }}>
          <h2 className={s.h3}>関連する解説</h2>
          <ul style={{ paddingLeft: 20, fontSize: 14.5 }}>
            {others.map((o) => <li key={o.slug} style={{ margin: "4px 0" }}><Link href={`/guide/${o.slug}`} style={{ color: "var(--blue-deep)" }}>{o.title}</Link></li>)}
          </ul>
        </section>
      </article>
    </HhShell>
  );
}

export async function getStaticPaths() {
  return { paths: GUIDES.map((g) => ({ params: { slug: g.slug } })), fallback: false };
}
export async function getStaticProps({ params }) {
  return { props: { slug: params.slug } };
}
