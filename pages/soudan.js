import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { HhShell, Tip } from "../components/HhShell";
import s from "../styles/hh.module.css";

// 薬のリスト整理（AI一次整理）。薬剤師が設計したプロンプトで、費用と制度の観点だけを整理する。
// 無料枠は薬機レーダーの診断と共通（訪問者あたり6回）。個人プラン（月額500円）で無制限。

const SITE_URL = "https://med-ad-diagnostic.vercel.app";
const PAGE_URL = `${SITE_URL}/soudan`;
const PAGE_TITLE = "薬のリスト整理｜市販薬で済む薬・処方のままの薬・確認すべき薬を分ける | 世帯の医療費計算機";
const PAGE_DESC =
  "家族の薬のリストを貼ると、薬剤師が設計したAIが「処方のままが自然」「市販薬で済む可能性」「医師・薬剤師に確認」に分け、先発・後発、市販薬の同一成分、2027年のOTC類似薬の見込みを整理します。無料、登録不要。";

const AGES = ["成人", "65歳以上", "子ども", "妊娠中・授乳中", "混在"];
const VISITS = ["毎月通院している", "ときどき受診する", "ほとんど受診しない"];
const SAMPLE = `父（78歳・毎月内科）
アムロジピン錠5mg 1日1回
ロスバスタチン錠2.5mg 1日1回
ロキソプロフェンNaテープ100mg 1日1回
ムコスタ錠100mg 1日3回
母（75歳）
ヒルドイドソフト軟膏 1日2回
アレグラ錠60mg 1日2回
カロナール錠200mg 頭痛時`;

const VERDICT_STYLE = {
  "処方のままが自然": { bg: "var(--blue-bg)", line: "var(--blue-line)", ink: "var(--blue-deep)" },
  "市販薬で済む可能性": { bg: "var(--mint-bg)", line: "var(--mint-line)", ink: "var(--mint-deep)" },
  "医師・薬剤師に確認": { bg: "var(--warn-bg)", line: "#f3d9a4", ink: "var(--warn)" },
};

export default function Soudan() {
  const [text, setText] = useState("");
  const [age, setAge] = useState("65歳以上");
  const [visit, setVisit] = useState("毎月通院している");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [usage, setUsage] = useState({ used: 0, limit: 6, pro: false });
  const [needUpgrade, setNeedUpgrade] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const token = () => {
    try {
      return window.localStorage.getItem("med_ad_token") || "";
    } catch {
      return "";
    }
  };

  const refreshUsage = useCallback(async () => {
    try {
      const t = token();
      const r = await fetch("/api/usage", { headers: t ? { "x-entitlement-token": t } : {} });
      if (!r.ok) return;
      const d = await r.json();
      setUsage({ used: Number(d.used) || 0, limit: Number(d.limit) || 6, pro: !!d.pro });
    } catch {
      /* 表示用 */
    }
  }, []);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  // Stripe Checkout からの復帰（個人プラン）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (!status) return;
    const sessionId = params.get("session_id");
    params.delete("checkout");
    params.delete("session_id");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    if (status !== "success" || !sessionId) return;
    (async () => {
      try {
        const r = await fetch("/api/verify-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.pro && d.token) {
          window.localStorage.setItem("med_ad_pro", "1");
          window.localStorage.setItem("med_ad_token", d.token);
          setNeedUpgrade(false);
          refreshUsage();
        } else {
          setErr("決済の確認ができませんでした。反映されない場合はお問い合わせください。");
        }
      } catch {
        setErr("決済の確認中にエラーが発生しました。");
      }
    })();
  }, [refreshUsage]);

  const run = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setErr("");
    setResult(null);
    setNeedUpgrade(false);
    try {
      const t = token();
      const r = await fetch("/api/kusuri", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(t ? { "x-entitlement-token": t } : {}) },
        body: JSON.stringify({ text, age, visit }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.usage && typeof d.usage.used === "number") setUsage({ used: d.usage.used, limit: d.usage.limit || 6, pro: !!d.usage.pro });
      if (r.status === 402) {
        setNeedUpgrade(true);
        setErr(d.error || "無料枠の上限に達しました。");
        return;
      }
      if (r.status === 429) {
        setErr(d.error || "リクエストが集中しています。しばらく置いてからお試しください。");
        return;
      }
      if (!r.ok) throw new Error(d.error || `エラー (${r.status})`);
      setResult(d.result);
    } catch (e) {
      setErr(e.message || "整理に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const upgrade = async () => {
    setCheckoutBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "individual", returnTo: "/soudan" }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) {
        window.location.href = d.url;
        return;
      }
      throw new Error(d.error || "決済ページの作成に失敗しました");
    } catch (e) {
      setErr(e.message || "決済の開始に失敗しました");
      setCheckoutBusy(false);
    }
  };

  const remaining = Math.max(0, usage.limit - usage.used);
  const counts = result ? result.items.reduce((a, it) => ({ ...a, [it.verdict]: (a[it.verdict] || 0) + 1 }), {}) : {};

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
          <h1 className={s.h1}>家族の薬のリストを、<em>市販薬で済む薬・処方のままの薬・確認すべき薬</em>に分ける</h1>
          <p className={s.lead}>
            お薬手帳の内容を貼ると、薬剤師が設計したAIが1剤ずつ、先発か後発か、同じ成分の市販薬があるか、2027年のOTC類似薬の対象になり得るかを整理し、3つに分けます。費用と制度の観点だけを扱い、薬をやめる・替える判断はしません。
          </p>
          <div className={s.trust}><span>無料枠 {usage.pro ? "無制限（個人プラン）" : `残り${remaining}回`}</span><span>薬のリストは保存しない</span><span>薬剤師が設計</span></div>
        </div>
        <aside className={s.heroAside}>
          <h2>貼り方</h2>
          <ul>
            <li>薬の名前と量を1行ずつ。家族ごとに名前や続柄の行を入れる</li>
            <li>お薬手帳の写真を見ながら、そのまま書き写して構いません</li>
            <li>氏名・住所・生年月日は不要です</li>
          </ul>
        </aside>
      </div>

      <section className={`${s.panel} ${s.big}`}>
        <div className={s.panelHead}><span className={s.kicker}>入力</span><h2 className={s.h2}>薬のリストを貼る</h2></div>
        <div className={s.field}>
          <label className={s.label} htmlFor="list">薬のリスト <span className={s.req}>必須</span></label>
          <textarea id="list" className={s.input} style={{ height: 220, padding: 12, lineHeight: 1.6, resize: "vertical" }} placeholder={SAMPLE} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} />
          <div className={s.btnRow} style={{ marginTop: 6 }}>
            <button type="button" className={s.btnGhost} onClick={() => setText(SAMPLE)}>例を入れて試す</button>
            <span className={s.help}>{text.length} / 3,000文字</span>
          </div>
        </div>
        <div className={s.grid} style={{ marginTop: 12 }}>
          <div className={s.field}>
            <label className={s.label} htmlFor="age">年齢の目安</label>
            <select id="age" className={s.input} value={age} onChange={(e) => setAge(e.target.value)}>
              {AGES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="visit">受診の状況</label>
            <select id="visit" className={s.input} value={visit} onChange={(e) => setVisit(e.target.value)}>
              {VISITS.map((v) => <option key={v}>{v}</option>)}
            </select>
            <p className={s.help}>定期受診のついでに出ている薬は、市販薬に替えても安くなりません。</p>
          </div>
        </div>
        <div className={s.btnRow}>
          <button type="button" className={s.btnPrimary} onClick={run} disabled={loading || !text.trim()}>{loading ? "整理しています（30秒ほど）…" : "AIで整理する"}</button>
          {!usage.pro && <span className={s.help}>無料枠：残り{remaining}回（薬機レーダーの診断と共通）</span>}
        </div>
        {err && <p className={s.notice}>{err}</p>}
        {needUpgrade && (
          <div className={s.verdict} style={{ marginTop: 12 }}>
            <span className={s.verdictIcon} aria-hidden="true">¥</span>
            <div>
              <p className={s.verdictTitle}>無料枠を使い切りました。個人プラン（月額500円）で回数無制限になります</p>
              <p className={s.verdictText}>薬機レーダーの広告診断も同じプランで無制限です。いつでも解約できます。</p>
              <div className={s.btnRow} style={{ marginTop: 10 }}>
                <button type="button" className={s.btnPrimary} onClick={upgrade} disabled={checkoutBusy}>{checkoutBusy ? "決済ページを開いています…" : "個人プランに申し込む（月額500円）"}</button>
                <Link href="/tokushoho" className={s.help}>特定商取引法に基づく表記</Link>
              </div>
            </div>
          </div>
        )}
      </section>

      {result && (
        <section className={`${s.panel} ${s.big}`}>
          <div className={s.panelHead}><span className={s.kicker}>結果</span><h2 className={s.h2}>整理の結果（AI一次整理）</h2></div>
          <div className={s.kpis}>
            {["市販薬で済む可能性", "処方のままが自然", "医師・薬剤師に確認"].map((v) => (
              <div key={v} className={s.kpi} style={{ background: VERDICT_STYLE[v].bg, borderColor: VERDICT_STYLE[v].line }}>
                <div className={s.kpiLabel}>{v}</div>
                <div className={s.kpiValue}>{counts[v] || 0}<span style={{ fontSize: 14, fontWeight: 500 }}> 剤</span></div>
              </div>
            ))}
          </div>
          <div className={s.verdict}>
            <span className={s.verdictIcon} aria-hidden="true">✓</span>
            <div><p className={s.verdictTitle}>要点</p><p className={s.verdictText}>{result.summary}</p></div>
          </div>

          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>薬</th><th>区分</th><th>市販薬の同一成分</th><th>OTC類似薬 <Tip label="OTC類似薬">2027年3月施行想定の制度。対象の処方薬は薬剤費の4分の1が「特別の料金」として上乗せされる見込みです。対象品目は告示で確定するため、ここでは見込みとして表示しています。</Tip></th><th>整理</th></tr></thead>
              <tbody>
                {result.items.map((it, i) => {
                  const st = VERDICT_STYLE[it.verdict] || VERDICT_STYLE["医師・薬剤師に確認"];
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{it.name}</td>
                      <td>{it.kind}</td>
                      <td>{it.otc_same_ingredient}</td>
                      <td>{it.otc_like}</td>
                      <td>
                        <span className={s.badge} style={{ background: st.bg, borderColor: st.line, color: st.ink, border: "1px solid" }}>{it.verdict}</span>
                        <div className={s.help} style={{ marginTop: 4 }}>{it.reason}</div>
                        {it.caution && it.caution !== "特になし" && <div className={s.help} style={{ color: "var(--warn)" }}>注意：{it.caution}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {result.questions_for_pharmacist?.length > 0 && (
            <>
              <h3 className={s.h3}>かかりつけ薬局・処方医に聞くとよいこと</h3>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15 }}>
                {result.questions_for_pharmacist.map((q, i) => <li key={i} style={{ margin: "4px 0" }}>{q}</li>)}
              </ul>
            </>
          )}

          <p className={s.notice}>
            この結果はAIによる一次整理で、薬剤師が設計した基準に沿って費用と制度の観点を整理したものです。診断・治療の判断ではなく、薬をやめる・減らす・替える指示でもありません。変更は必ず処方医・かかりつけ薬局に相談してください。市販薬は用量や配合が処方薬と異なることがあります。
          </p>
          <div className={s.btnRow}>
            <Link href="/rx-or-otc" className={s.btnMint}>「市販薬で済む可能性」の薬を、費用で比べる →</Link>
          </div>
        </section>
      )}

      <section className={s.basis}>
        <h2>設計と根拠</h2>
        <ul>
          <li>整理の基準は薬剤師（薬機法管理者）が設計。慢性疾患の薬・市販薬に同一成分がない薬は「処方のまま」、単発の症状に使う同一成分の市販薬がある薬は「市販薬で済む可能性」、重複・相互作用・小児/妊婦/高齢者の注意がある薬は「確認」に分ける</li>
          <li>OTC類似薬の見込み：<a href="https://www.mhlw.go.jp/content/12401000/001629737.pdf" target="_blank" rel="noopener noreferrer">厚生労働省 資料</a>。77成分・薬剤費の1/4、2027年3月施行想定。対象は告示で確定。確認日 2026-09-07</li>
          <li>貼った薬のリストはAIの処理にだけ使い、サーバーに保存しません。利用回数の計上のために訪問者IDとIPの変換値だけを保持します（<a href="/privacy">プライバシーポリシー</a>）</li>
        </ul>
      </section>
    </HhShell>
  );
}
