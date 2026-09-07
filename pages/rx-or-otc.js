import Head from "next/head";
import { useMemo, useState } from "react";
import { HhShell, Tip } from "../components/HhShell";
import s from "../styles/hh.module.css";
import { DEFAULT_POINTS, POINT_LABELS, compareRxOtc } from "../lib/rxotc.mjs";

// 段階1の手前：「処方でもらうか、市販薬で買うか」を自己負担で比べる（無料・登録不要・サーバー送信なし）

const SITE_URL = "https://med-ad-diagnostic.vercel.app";
const PAGE_URL = `${SITE_URL}/rx-or-otc`;
const PAGE_TITLE = "処方か市販薬か 自己負担比較計算機｜受診料・調剤料込みで比べる | 薬機レーダー";
const PAGE_DESC =
  "同じ薬を病院で処方してもらう場合と市販薬で買う場合の自己負担を、再診料・処方箋料・調剤料・薬剤料と負担割合から概算して比べます。2027年に予定されるOTC類似薬の特別の料金にも対応。薬剤師が設計、登録不要。";

const yen = (n) => `${Math.round(n || 0).toLocaleString("ja-JP")}円`;

const PRESETS = [
  { label: "ロキソプロフェン錠60mg（後発）10錠", price: "10.5", quantity: "10", otcHint: "例：ロキソニンS 12錠 約800円" },
  { label: "ロキソニン錠60mg（先発）10錠", price: "10.8", quantity: "10", otcHint: "例：ロキソニンS 12錠 約800円" },
  { label: "自分で入力", price: "", quantity: "", otcHint: "" },
];

export default function RxOrOtc() {
  const [f, setF] = useState({ preset: 0, price: PRESETS[0].price, quantity: PRESETS[0].quantity, ratio: "0.3", standalone: true, otcLike: false, otcPrice: "", hours: "1.5", hourlyValue: "0" });
  const [points, setPoints] = useState({ ...DEFAULT_POINTS });
  const [showPoints, setShowPoints] = useState(false);

  const r = useMemo(
    () => compareRxOtc({ price: f.price, quantity: f.quantity, ratio: Number(f.ratio), standalone: f.standalone, otcLike: f.otcLike, otcPrice: f.otcPrice, hours: f.hours, hourlyValue: f.hourlyValue, points }),
    [f, points]
  );
  const set = (patch) => setF((st) => ({ ...st, ...patch }));
  const choosePreset = (i) => set({ preset: i, price: PRESETS[i].price, quantity: PRESETS[i].quantity });
  const hasInput = Number(f.price) > 0 && Number(f.quantity) > 0 && Number(f.otcPrice) > 0;
  const maxTotal = Math.max(r.rxWithTime, r.otc, 1);

  const verdict = (() => {
    if (!hasInput) return { title: "薬価・数量と市販薬の価格を入れると比較できます", text: "薬価は薬局の明細書に載っています。市販薬は同じ日数分の価格を入れてください。" };
    if (r.cheaper === "even") return { title: "お金の面ではどちらも同じです", text: "受診の時間を考慮するなら市販薬が有利です。" };
    const side = r.cheaper === "rx" ? "処方でもらう方" : "市販薬で買う方";
    const base = `お金の面では${side}が ${yen(r.diff)} 安いです。`;
    if (r.timeCost > 0 && r.cheaperWithTime !== r.cheaper) return { title: `${side}が安い（時間を含めると逆転）`, text: `${base} ただし受診の時間を ${yen(r.timeCost)} と見ると、市販薬の方が ${yen(r.diffWithTime)} 有利になります。` };
    return { title: `${side}が ${yen(r.diff)} 安い`, text: base + (f.standalone ? " この薬のためだけに受診する前提です。定期受診のついでなら結果が変わります。" : " 定期受診のついでに出してもらう前提です。") };
  })();

  return (
    <HhShell current="rxotc">
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
          <h1 className={s.h1}>処方か市販薬か、<em>受診料と調剤料込み</em>で比べる</h1>
          <p className={s.lead}>同じ成分の薬でも、病院で処方してもらうと薬代のほかに再診料・処方箋料・調剤の技術料がかかります。3割負担でも単発の症状なら市販薬の方が安いことがあり、定期受診のついでなら処方の方が安いことがほとんどです。</p>
          <div className={s.trust}><span>無料・登録不要</span><span>入力内容はサーバーへ送信しない</span><span>薬剤師が設計</span></div>
        </div>
        <aside className={s.heroAside}>
          <h2>答えを分けるのは「受診のしかた」</h2>
          <ul>
            <li>この薬のためだけに受診する → 受診料と調剤の技術料が丸ごとかかる</li>
            <li>定期受診のついで → 追加は薬剤調剤料と薬代だけ</li>
            <li>2027年3月〜（予定）：市販薬に似た処方薬に薬剤費の1/4の特別の料金</li>
          </ul>
        </aside>
      </div>

      <section className={s.panel}>
        <div className={s.panelHead}><span className={s.kicker}>STEP 1</span><h2 className={s.h2}>処方でもらう場合</h2></div>
        <div className={s.grid}>
          <div className={s.field}>
            <label className={s.label} htmlFor="preset">薬の例</label>
            <select id="preset" className={s.input} value={f.preset} onChange={(e) => choosePreset(Number(e.target.value))}>
              {PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="price">薬価（1錠・1包・1本あたり、円） <span className={s.req}>必須</span></label>
            <input id="price" className={s.input} type="number" inputMode="decimal" min="0" step="0.1" value={f.price} onChange={(e) => set({ price: e.target.value, preset: 2 })} />
            <p className={s.help}>薬局の明細書に載っています。ロキソプロフェン錠60mgは後発10.5円・先発10.8円（2026年8月時点）。</p>
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="qty">数量 <span className={s.req}>必須</span></label>
            <input id="qty" className={s.input} type="number" inputMode="numeric" min="0" value={f.quantity} onChange={(e) => set({ quantity: e.target.value, preset: 2 })} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="ratio">負担割合</label>
            <select id="ratio" className={s.input} value={f.ratio} onChange={(e) => set({ ratio: e.target.value })}>
              <option value="0.3">3割（現役世代）</option>
              <option value="0.2">2割（未就学児・一部の高齢者）</option>
              <option value="0.1">1割</option>
              <option value="0">0割（自治体の子ども医療費助成など）</option>
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="standalone">受診のしかた</label>
            <select id="standalone" className={s.input} value={f.standalone ? "1" : "0"} onChange={(e) => set({ standalone: e.target.value === "1" })}>
              <option value="1">この薬のためだけに受診する</option>
              <option value="0">定期受診のついでに出してもらう</option>
            </select>
          </div>
        </div>
        <div className={s.checks}>
          <label className={s.check}>
            <input type="checkbox" checked={f.otcLike} onChange={(e) => set({ otcLike: e.target.checked })} />
            <span>OTC類似薬の特別の料金（薬剤費の4分の1）を上乗せする <Tip label="OTC類似薬の特別の料金">市販薬と成分・用法が同じ処方薬（77成分・約1,100品目）について、薬剤費の4分の1を患者が別に払う制度で、2027年3月の施行を想定して準備されています。こども・低所得者・がんや難病などの慢性疾患患者は対象外の見込みです。<br /><a href="https://www.mhlw.go.jp/content/12401000/001629737.pdf" target="_blank" rel="noopener noreferrer">厚生労働省 資料（PDF）</a></Tip></span>
          </label>
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}><span className={s.kicker}>STEP 2</span><h2 className={s.h2}>市販薬で買う場合</h2></div>
        <div className={s.grid}>
          <div className={s.field}>
            <label className={s.label} htmlFor="otc">同じ日数分の市販薬の価格（円） <span className={s.req}>必須</span></label>
            <input id="otc" className={s.input} type="number" inputMode="numeric" min="0" placeholder={PRESETS[f.preset]?.otcHint || "例：800"} value={f.otcPrice} onChange={(e) => set({ otcPrice: e.target.value })} />
            <p className={s.help}>市販薬は1回量や配合成分が処方薬と違うことがあります。箱の成分表示で確認してください。</p>
          </div>
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}><span className={s.kicker}>STEP 3</span><h2 className={s.h2}>受診にかかる時間（任意）</h2></div>
        <div className={s.grid}>
          <div className={s.field}><label className={s.label} htmlFor="hours">受診と薬局にかかる時間（時間）</label><input id="hours" className={s.input} type="number" inputMode="decimal" min="0" step="0.5" value={f.hours} onChange={(e) => set({ hours: e.target.value })} /></div>
          <div className={s.field}><label className={s.label} htmlFor="hv">1時間の価値（円。0なら時間を無視）</label><input id="hv" className={s.input} type="number" inputMode="numeric" min="0" step="100" value={f.hourlyValue} onChange={(e) => set({ hourlyValue: e.target.value })} /><p className={s.help}>時給や、その時間に稼げた額の目安です。</p></div>
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}><span className={s.kicker}>結果</span><h2 className={s.h2}>自己負担の比較（概算）</h2></div>
        <div className={[s.verdict, hasInput && r.cheaper !== "even" ? "" : s.verdictNeutral].join(" ")}>
          <span className={s.verdictIcon} aria-hidden="true">{hasInput ? "✓" : "i"}</span>
          <div><p className={s.verdictTitle}>{verdict.title}</p><p className={s.verdictText}>{verdict.text}</p></div>
        </div>
        <div className={s.chart} role="img" aria-label={`処方 ${yen(r.rx.total)}、市販薬 ${yen(r.otc)}`}>
          <div className={s.chartRow}>
            <span className={s.chartName}><span className={s.swatch} style={{ background: "#1d4ed8" }} />処方でもらう</span>
            <div className={s.bar}><div className={s.barFill} style={{ width: `${(r.rx.total / maxTotal) * 100}%`, background: "#1d4ed8" }} /></div>
            <span className={s.chartVal}>{yen(r.rx.total)}</span>
          </div>
          {r.timeCost > 0 && (
            <div className={s.chartRow}>
              <span className={s.chartName}><span className={s.swatch} style={{ background: "#93b4f5" }} />処方＋受診の時間</span>
              <div className={s.bar}><div className={s.barFill} style={{ width: `${(r.rxWithTime / maxTotal) * 100}%`, background: "#93b4f5" }} /></div>
              <span className={s.chartVal}>{yen(r.rxWithTime)}</span>
            </div>
          )}
          <div className={s.chartRow}>
            <span className={s.chartName}><span className={s.swatch} style={{ background: "#0f9d8a" }} />市販薬で買う</span>
            <div className={s.bar}><div className={s.barFill} style={{ width: `${(r.otc / maxTotal) * 100}%`, background: "#0f9d8a" }} /></div>
            <span className={s.chartVal}>{yen(r.otc)}</span>
          </div>
        </div>
        <div className={s.breakdown}>
          <div className={[s.bd, hasInput && r.cheaper === "rx" ? s.bdWin : ""].join(" ")}>
            <div className={s.bdTitle}><span className={s.swatch} style={{ background: "#1d4ed8" }} />処方でもらう</div>
            <div className={s.bdRow}><span>病院の窓口（再診料など {r.rx.points.clinic}点）</span><span>{yen(r.rx.clinicCopay)}</span></div>
            <div className={s.bdRow}><span>薬局の窓口（技術料 {r.rx.points.pharmacyTech}点＋薬剤料 {r.rx.points.drug}点）</span><span>{yen(r.rx.pharmacyCopay)}</span></div>
            {f.otcLike && <div className={s.bdRow}><span>OTC類似薬の特別の料金</span><span>{yen(r.rx.specialFee)}</span></div>}
            <div className={`${s.bdRow} ${s.bdTotal}`}><span>自己負担の合計</span><span>{yen(r.rx.total)}</span></div>
          </div>
          <div className={[s.bd, hasInput && r.cheaper === "otc" ? s.bdWin : ""].join(" ")}>
            <div className={s.bdTitle}><span className={s.swatch} style={{ background: "#0f9d8a" }} />市販薬で買う</div>
            <div className={s.bdRow}><span>市販薬の価格</span><span>{yen(r.otc)}</span></div>
            <div className={s.bdRow}><span>受診・調剤の費用</span><span>0円</span></div>
            <div className={`${s.bdRow} ${s.bdTotal}`}><span>自己負担の合計</span><span>{yen(r.otc)}</span></div>
          </div>
        </div>
        <p className={s.notice}>一部負担金は10円未満を四捨五入しています。実際の請求は医療機関・薬局の加算（医療DX、後発品体制、時間外など）で数十円から数百円変わります。この計算機は費用の比較だけを扱い、処方薬と市販薬のどちらを使うべきかという医学的な判断はしません。症状が続く、原因が分からない、他の薬を飲んでいる、妊娠中・授乳中、子どもや高齢者の場合は、費用より先に医師・薬剤師に相談してください。</p>
        <button type="button" className={s.btnGhost} onClick={() => setShowPoints((v) => !v)}>{showPoints ? "点数の設定を閉じる" : "点数を自分で設定する（改定後の値に差し替え可）"}</button>
        {showPoints && (
          <div className={s.grid}>
            {Object.keys(DEFAULT_POINTS).map((k) => (
              <div key={k} className={s.field}>
                <label className={s.label} htmlFor={`pt-${k}`}>{POINT_LABELS[k].label}{POINT_LABELS[k].verified ? "" : <span className={`${s.badge} ${s.badgeWarn}`}>令和8年度点数表で要確認</span>}</label>
                <input id={`pt-${k}`} className={s.input} type="number" inputMode="numeric" min="0" value={points[k]} onChange={(e) => setPoints({ ...points, [k]: Number(e.target.value) || 0 })} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={s.panel} style={{ background: "var(--mint-bg)", borderColor: "var(--mint-line)" }}>
        <div className={s.panelHead}><span className={s.kicker} style={{ color: "var(--mint-deep)" }}>薬のリスト整理</span><h2 className={s.h2}>いま飲んでいる薬のうち、市販薬で済むものはどれか</h2></div>
        <p className={s.desc}>薬のリストを貼ると、薬剤師が設計したAIが「処方のままが自然」「市販薬で済む可能性」「医師・薬剤師に確認」に分けます。無料、登録不要、リストは保存しません。</p>
        <a href="/soudan" className={s.btnMint}>薬のリストを整理する →</a>
      </section>

      <section className={s.basis}>
        <h2>根拠と確認日</h2>
        <ul>
          <li>再診料76点・物価対応料2点・外来管理加算52点：令和8年6月改定の値（二次情報で確認、2026-09-07）。<a href="https://www.mhlw.go.jp/stf/newpage_71068.html" target="_blank" rel="noopener noreferrer">厚生労働省 令和8年度診療報酬改定</a></li>
          <li>処方箋料60点・調剤基本料1 45点・薬剤調剤料24点・服薬管理指導料45点：令和6年度の値。令和8年度点数表での再確認が必要。<a href="https://www.nichiyaku.or.jp/yakuzaishi/pharmacy-info/document/r08" target="_blank" rel="noopener noreferrer">日本薬剤師会 改定資料</a></li>
          <li>OTC類似薬の特別の料金：<a href="https://www.mhlw.go.jp/content/12401000/001629737.pdf" target="_blank" rel="noopener noreferrer">厚生労働省 資料</a>。77成分・薬剤費の1/4、2027年3月施行想定。確認日 2026-09-07</li>
          <li>薬価：日経メディカル処方薬事典（ロキソプロフェンNa錠60mg 10.5円、ロキソニン錠60mg 10.8円、2026年8月時点）</li>
        </ul>
        <p className={s.help} style={{ marginTop: 10 }}>点数は2026年9月時点の公開情報に基づく概算で、一部は令和8年度点数表での再確認が必要です。入力内容はサーバーへ送信されません。</p>
      </section>
    </HhShell>
  );
}
