import Head from "next/head";
import { HhShell } from "../../components/HhShell";
import s from "../../styles/hh.module.css";

// 決済後の案内。Stripe のセッションを取得して支払い済みを確認し、受付番号と送り方を表示する。
const CONTACT_EMAIL = "masa@med-ad-masa.com";

export default function Thanks({ ok, ref, email }) {
  const subject = `【相談 ${ref}】家族の薬と医療費の相談`;
  const body = [
    `受付番号：${ref}`,
    "",
    "【相談したいこと】（処方か市販薬か／親の薬の整理／先発か後発か／医療費控除の載らない分 など）",
    "",
    "【家族構成と年齢の目安】",
    "",
    "【いまの薬・受診の状況】（薬の名前と量、通っている病院の数、月の窓口負担の目安）",
    "",
    "【その他】",
  ].join("\n");
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <HhShell current="soudan">
      <Head>
        <title>お申込みありがとうございます | 世帯の医療費計算機</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <section className={s.panel}>
        {ok ? (
          <>
            <div className={s.panelHead}><span className={s.kicker}>受付</span><h2 className={s.h2}>お申込みありがとうございます</h2></div>
            <div className={s.kpis}>
              <div className={`${s.kpi} ${s.kpiHot}`}><div className={s.kpiLabel}>受付番号</div><div className={s.kpiValue}>{ref}</div><div className={s.kpiSub}>メールの件名に入れてください</div></div>
              {email && <div className={s.kpi}><div className={s.kpiLabel}>回答先メールアドレス</div><div className={s.kpiValue} style={{ fontSize: 16 }}>{email}</div><div className={s.kpiSub}>Stripeでご入力いただいたもの</div></div>}
            </div>
            <h3 className={s.h3}>次にすること</h3>
            <p className={s.desc}>下のボタンからメールを開き、相談内容を送ってください。件名と本文のひな形が入ります。受領後、3営業日以内に文章で回答します。</p>
            <div className={s.btnRow}>
              <a className={s.btnMint} href={mailto}>相談内容をメールで送る</a>
              <span className={s.help}>ボタンが開かない場合：{CONTACT_EMAIL} 宛に件名「{subject}」で送ってください。</span>
            </div>
            <p className={s.notice}>薬のリストは、お薬手帳の写真でも構いません。氏名や住所は不要です。回答前であれば全額返金しますので、キャンセルの場合は同じメールアドレスへご連絡ください。</p>
          </>
        ) : (
          <>
            <div className={s.panelHead}><span className={s.kicker}>確認できませんでした</span><h2 className={s.h2}>お支払いの確認ができませんでした</h2></div>
            <p className={s.desc}>決済が完了している場合は、Stripeからの領収書メールに記載の情報を添えて {CONTACT_EMAIL} までご連絡ください。決済をやり直す場合は<a href="/soudan">相談ページ</a>へ戻ってください。</p>
          </>
        )}
      </section>
    </HhShell>
  );
}

export async function getServerSideProps({ query }) {
  const sessionId = typeof query.session_id === "string" ? query.session_id : "";
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) return { props: { ok: false, ref: "", email: "" } };
  try {
    const { getStripe } = await import("../../lib/stripe");
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === "paid" && session.mode === "payment";
    const ref = sessionId.slice(-8).toUpperCase();
    const email = session.customer_details?.email || "";
    return { props: { ok: !!paid, ref: paid ? ref : "", email: paid ? email : "" } };
  } catch (e) {
    console.error("thanks session lookup failed:", e?.message || e);
    return { props: { ok: false, ref: "", email: "" } };
  }
}
