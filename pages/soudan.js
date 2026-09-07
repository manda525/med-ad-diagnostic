import Head from "next/head";
import { useEffect, useState } from "react";
import { HhShell } from "../components/HhShell";
import s from "../styles/hh.module.css";

// 薬剤師相談（単発・都度払い）。STRIPE_PRICE_CONSULT が未設定なら「準備中」として関心だけを数える。

const SITE_URL = "https://med-ad-diagnostic.vercel.app";
const PAGE_URL = `${SITE_URL}/soudan`;
const PAGE_TITLE = "家族の薬と医療費、薬剤師に相談する（単発） | 世帯の医療費計算機";
const PAGE_DESC =
  "処方か市販薬か、親の薬の整理、マイナポータルに載らない医療費の扱い。薬局に属さない薬剤師が、世帯の事情に合わせて3営業日以内にメールで回答します。都度払い、登録不要。";
const CONTACT_EMAIL = "masa@med-ad-masa.com";

const EXAMPLES = [
  { t: "処方か市販薬か", d: "いま処方でもらっている薬のうち、市販薬で済むもの・済まないものを、受診のしかたと費用込みで整理します。" },
  { t: "親の薬の整理", d: "複数の病院からもらっている薬のリストを送ってもらい、重複や飲み合わせで医師・薬剤師に確認すべき点を一般的な注意として整理します。" },
  { t: "先発品か後発品か", d: "先発品を希望している薬について、特別の料金の見込みと、医療上の理由で先発品が必要な場合の考え方を整理します。" },
  { t: "医療費控除の載らない分", d: "領収書のどの行が医療費通知に載らないか、どれが控除対象かを、世帯の領収書に沿って整理します。" },
];

export default function Soudan({ available, amount, currency }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [interested, setInterested] = useState(false);
  const [count, setCount] = useState(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("interest-soudan") === "1") setInterested(true);
    } catch {
      /* noop */
    }
  }, []);

  const checkout = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "consult" }) });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || "決済ページを開けませんでした");
      window.location.href = j.url;
    } catch (e) {
      setErr(String(e.message || e));
      setBusy(false);
    }
  };

  const interest = async () => {
    try {
      const r = await fetch("/api/interest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: "soudan" }) });
      const j = await r.json();
      if (typeof j.count === "number") setCount(j.count);
    } catch {
      /* noop */
    }
    setInterested(true);
    try {
      window.localStorage.setItem("interest-soudan", "1");
    } catch {
      /* noop */
    }
  };

  const priceText = available && amount ? `${amount.toLocaleString("ja-JP")}円（税込・1回）` : "準備中";

  return (
    <HhShell current="soudan">
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESC} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESC} />
        <meta property="og:image" content={`${SITE_URL}/og-image.png`} />
        <meta property="og:site_name" content="薬機レーダー" />
        <meta property="og:locale" content="ja_JP" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESC} />
      </Head>

      <div className={s.hero}>
        <div>
          <h1 className={s.h1}>家族の薬と医療費を、<em>薬局に属さない薬剤師</em>に相談する</h1>
          <p className={s.lead}>
            薬局の薬剤師は、自分の薬局の処方を減らす提案を立場上できません。ここでは、どこの薬局にも属さない薬剤師が、世帯の事情に合わせて「処方か市販薬か」「親の薬の整理」「載らない医療費の扱い」を文章で整理して返します。
          </p>
          <div className={s.trust}><span>3営業日以内にメールで回答</span><span>都度払い・自動更新なし</span><span>薬剤師・薬機法管理者</span></div>
        </div>
        <aside className={s.heroAside}>
          <h2>料金と流れ</h2>
          <ul>
            <li>料金：{priceText}</li>
            <li>お支払い後、受付番号つきの案内が表示されます</li>
            <li>相談内容をメールで送っていただき、3営業日以内に文章で回答します</li>
            <li>回答前であれば全額返金します</li>
          </ul>
        </aside>
      </div>

      <section className={s.panel}>
        <div className={s.panelHead}><span className={s.kicker}>相談の例</span><h2 className={s.h2}>こんな相談に向いています</h2></div>
        <div className={s.catGrid}>
          {EXAMPLES.map((e) => (
            <div key={e.t} className={s.cat} style={{ cursor: "default" }}>
              <span className={s.catTitle}>{e.t}</span>
              <span className={s.help}>{e.d}</span>
            </div>
          ))}
        </div>
        <p className={s.notice}>
          回答は情報提供と薬剤師の見解で、診断・治療の判断や、特定の薬をやめる・変える指示はしません。症状が続く場合や緊急の場合は医療機関へ。薬の変更は必ず処方医・かかりつけ薬局に相談してください。
        </p>
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}><span className={s.kicker}>申込み</span><h2 className={s.h2}>{available ? "相談を申し込む" : "準備中です"}</h2></div>
        {available ? (
          <>
            <p className={s.desc}>「申し込む」を押すと決済ページ（Stripe）に移動します。決済後の画面に、相談内容の送り方と受付番号が表示されます。</p>
            <div className={s.btnRow}>
              <button type="button" className={s.btnPrimary} onClick={checkout} disabled={busy}>{busy ? "決済ページを開いています…" : `申し込む（${priceText}）`}</button>
              <span className={s.help}>クレジットカード決済。領収書はStripeから発行されます。</span>
            </div>
            {err && <p className={s.notice}>{err}</p>}
          </>
        ) : (
          <>
            <p className={s.desc}>有料相談は準備中です。関心のある方が一定数を超えた時点で開始します。下のボタンを押していただくと、匿名で人数だけを数えます（個人情報は送信されません）。</p>
            <div className={s.btnRow}>
              <button type="button" className={s.btnPrimary} onClick={interest} disabled={interested}>{interested ? "ありがとうございます（受付済み）" : "有料相談に興味がある"}</button>
              {count !== null && <span className={s.help}>これまでに {count} 人</span>}
            </div>
            <p className={s.help} style={{ marginTop: 12 }}>
              今すぐ相談したい場合は、<a href={`mailto:${CONTACT_EMAIL}?subject=家族の薬と医療費の相談`}>メール</a>でご連絡ください。内容を伺ったうえでお見積もりします。
            </p>
          </>
        )}
      </section>

      <section className={s.basis}>
        <h2>回答する人</h2>
        <ul>
          <li>薬剤師（企業内薬剤師）。薬機法管理者、景表法第1級、YMAA・KTAA認証。医療広告・薬機法コンサルタント「まさ」として活動</li>
          <li>調剤薬局に所属していないため、処方を市販薬や後発品に置き換える提案に利害関係がありません</li>
          <li>特定商取引法に基づく表記は<a href="/tokushoho">こちら</a>。回答はメールでの文章によるもので、対面・電話は行いません</li>
        </ul>
      </section>
    </HhShell>
  );
}

export async function getServerSideProps() {
  const priceId = process.env.STRIPE_PRICE_CONSULT || "";
  let amount = null;
  let currency = "jpy";
  if (priceId && process.env.STRIPE_SECRET_KEY) {
    try {
      const { getStripe } = await import("../lib/stripe");
      const price = await getStripe().prices.retrieve(priceId);
      amount = price.unit_amount;
      currency = price.currency;
    } catch (e) {
      console.error("soudan price lookup failed:", e?.message || e);
    }
  }
  return { props: { available: !!(priceId && amount), amount, currency } };
}
