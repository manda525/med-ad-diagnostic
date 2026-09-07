import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import s from "../styles/hh.module.css";

// 世帯向け計算機の共通シェル（ヘッダー・フッター・フォント・ツールチップ）

export function HhShell({ current, children }) {
  return (
    <div className={s.root}>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>
      <div className={s.stripe} />
      <header className={s.header}>
        <div className={s.headerInner}>
          <Link href="/household" className={s.brand}>
            <span className={s.brandMark} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M3 11.5 12 4l9 7.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 10v9h13v-9" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
                <path d="M12 12v5M9.5 14.5h5" stroke="#8ff0dd" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <span>
              <span className={s.brandTitle}>世帯の医療費計算機</span>
              <span className={s.brandSub} style={{ display: "block" }}>薬剤師が設計｜Pharma-Ad Lab</span>
            </span>
          </Link>
          <nav className={s.headerNav} aria-label="計算機">
            <Link href="/household" aria-current={current === "household" ? "page" : undefined}>世帯の医療費</Link>
            <Link href="/rx-or-otc" aria-current={current === "rxotc" ? "page" : undefined}>処方か市販薬か</Link>
          </nav>
        </div>
      </header>
      <main className={s.main}>{children}</main>
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span>
            <a href="/">薬機レーダー</a>
            <a href="/tokushoho">特定商取引法に基づく表記</a>
            <a href="/terms">利用規約</a>
            <a href="/privacy">プライバシーポリシー</a>
          </span>
          <span>© 2026 Pharma-Ad Lab</span>
        </div>
      </footer>
    </div>
  );
}

export function Tip({ label = "説明", children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={s.tipBtn} aria-expanded={open} aria-label={`${label}の説明`} onClick={() => setOpen((v) => !v)}>
        ?
      </button>
      {open && <div className={s.tipBody}>{children}</div>}
    </>
  );
}
