import Head from "next/head";
import Link from "next/link";
import { useMemo, useState } from "react";
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
  const [f, setF] = useState({
    preset: 0,
    price: PRESETS[0].price,
    quantity: PRESETS[0].quantity,
    ratio: "0.3",
    standalone: true,
    otcLike: false,
    otcPrice: "",
    hours: "1.5",
    hourlyValue: "0",
  });
  const [points, setPoints] = useState({ ...DEFAULT_POINTS });
  const [showPoints, setShowPoints] = useState(false);

  const r = useMemo(
    () =>
      compareRxOtc({
        price: f.price,
        quantity: f.quantity,
        ratio: Number(f.ratio),
        standalone: f.standalone,
        otcLike: f.otcLike,
        otcPrice: f.otcPrice,
        hours: f.hours,
        hourlyValue: f.hourlyValue,
        points,
      }),
    [f, points]
  );

  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const choosePreset = (i) => {
    const p = PRESETS[i];
    set({ preset: i, price: p.price, quantity: p.quantity });
  };
  const hasInput = Number(f.price) > 0 && Number(f.quantity) > 0 && Number(f.otcPrice) > 0;

  const verdict = (() => {
    if (!hasInput) return "薬価・数量と市販薬の価格を入れると比較できます。";
    const side = r.cheaper === "rx" ? "処方でもらう方" : r.cheaper === "otc" ? "市販薬で買う方" : "どちらも同じ";
    const base = r.cheaper === "even" ? "お金の面では同じです。" : `お金の面では【${side}】が ${yen(r.diff)} 安いです。`;
    if (r.timeCost > 0 && r.cheaperWithTime !== r.cheaper) {
      return `${base} ただし受診の時間を ${yen(r.timeCost)} と見ると、市販薬の方が ${yen(r.diffWithTime)} 有利になります。`;
    }
    return base;
  })();

  return (
    <>
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

      <div style={S.container}>
        <Link href="/household" style={S.backLink}>
          ← 世帯の医療費計算機に戻る
        </Link>
        <p style={S.eyebrow}>無料・登録不要・薬剤師が設計</p>
        <h1 style={S.h1}>処方か市販薬か、自己負担で比べる</h1>
        <p style={S.lead}>
          同じ成分の薬でも、病院で処方してもらうと薬代のほかに再診料・処方箋料・調剤の技術料がかかります。3割負担でも、単発の症状なら市販薬の方が安いことがあり、定期受診のついでなら処方の方が安いことがほとんどです。薬価と市販薬の価格を入れて、どちらが安いかを概算します。
        </p>

        <section style={S.card}>
          <h2 style={S.h2}>1. 処方でもらう場合</h2>
          <label style={S.label}>
            薬の例
            <select style={S.input} value={f.preset} onChange={(e) => choosePreset(Number(e.target.value))}>
              {PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div style={S.grid2}>
            <label style={S.label}>
              薬価（1錠・1包・1本あたり、円）
              <input style={S.input} type="number" inputMode="decimal" min="0" step="0.1" value={f.price} onChange={(e) => set({ price: e.target.value, preset: 2 })} />
            </label>
            <label style={S.label}>
              数量
              <input style={S.input} type="number" inputMode="numeric" min="0" value={f.quantity} onChange={(e) => set({ quantity: e.target.value, preset: 2 })} />
            </label>
            <label style={S.label}>
              負担割合
              <select style={S.input} value={f.ratio} onChange={(e) => set({ ratio: e.target.value })}>
                <option value="0.3">3割（現役世代）</option>
                <option value="0.2">2割（未就学児・一部の高齢者）</option>
                <option value="0.1">1割</option>
                <option value="0">0割（自治体の子ども医療費助成など）</option>
              </select>
            </label>
            <label style={S.label}>
              受診のしかた
              <select style={S.input} value={f.standalone ? "1" : "0"} onChange={(e) => set({ standalone: e.target.value === "1" })}>
                <option value="1">この薬のためだけに受診する</option>
                <option value="0">定期受診のついでに出してもらう</option>
              </select>
            </label>
          </div>
          <label style={S.check}>
            <input type="checkbox" checked={f.otcLike} onChange={(e) => set({ otcLike: e.target.checked })} />
            OTC類似薬の特別の料金（薬剤費の4分の1）を上乗せする。2027年3月施行予定の制度で、こども・低所得者・慢性疾患患者などは対象外の見込み
          </label>
          <p style={S.hint}>
            薬価は薬局の明細書に載っています。ロキソプロフェン錠60mgは後発10.5円・先発10.8円（2026年8月時点）で、この薬は先発と後発の差がほとんどありません。
          </p>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>2. 市販薬で買う場合</h2>
          <div style={S.grid2}>
            <label style={S.label}>
              同じ日数分の市販薬の価格（円）
              <input style={S.input} type="number" inputMode="numeric" min="0" placeholder={PRESETS[f.preset]?.otcHint || "例：800"} value={f.otcPrice} onChange={(e) => set({ otcPrice: e.target.value })} />
            </label>
          </div>
          <p style={S.hint}>
            市販薬は1回量や配合成分が処方薬と違うことがあります。同じ成分でも用量が少ない製品があるので、箱の成分表示で確認してください。
          </p>
        </section>

        <section style={S.card}>
          <h2 style={S.h2}>3. 受診にかかる時間（任意）</h2>
          <div style={S.grid2}>
            <label style={S.label}>
              受診と薬局にかかる時間（時間）
              <input style={S.input} type="number" inputMode="decimal" min="0" step="0.5" value={f.hours} onChange={(e) => set({ hours: e.target.value })} />
            </label>
            <label style={S.label}>
              1時間の価値（円。0なら時間を無視）
              <input style={S.input} type="number" inputMode="numeric" min="0" step="100" value={f.hourlyValue} onChange={(e) => set({ hourlyValue: e.target.value })} />
            </label>
          </div>
        </section>

        <section style={{ ...S.card, ...S.resultCard }}>
          <h2 style={S.h2}>4. 結果（概算）</h2>
          <div style={S.compare}>
            <div style={{ ...S.box, ...(hasInput && r.cheaper === "rx" ? S.win : {}) }}>
              <div style={S.boxTitle}>処方でもらう</div>
              <Row k="病院の窓口（再診料など）" v={yen(r.rx.clinicCopay)} />
              <Row k="薬局の窓口（技術料＋薬剤料）" v={yen(r.rx.pharmacyCopay)} />
              {f.otcLike && <Row k="OTC類似薬の特別の料金" v={yen(r.rx.specialFee)} />}
              <Row k="自己負担の合計" v={yen(r.rx.total)} total />
              {r.timeCost > 0 && <Row k="時間を含めた合計" v={yen(r.rxWithTime)} />}
            </div>
            <div style={{ ...S.box, ...(hasInput && r.cheaper === "otc" ? S.win : {}) }}>
              <div style={S.boxTitle}>市販薬で買う</div>
              <Row k="市販薬の価格" v={yen(r.otc)} />
              <Row k="受診・調剤の費用" v="0円" />
              <Row k="自己負担の合計" v={yen(r.otc)} total />
            </div>
          </div>
          <p style={S.verdict}>{verdict}</p>
          <p style={S.hint}>
            処方側の内訳：医科 {r.rx.points.clinic}点＋薬局技術料 {r.rx.points.pharmacyTech}点＋薬剤料 {r.rx.points.drug}点＝{r.rx.points.total}点（1点10円）。一部負担金は10円未満を四捨五入しています。実際の請求は医療機関・薬局の加算（医療DX、後発品体制、時間外など）で数十円から数百円変わります。
          </p>
          <button type="button" style={S.linkBtn} onClick={() => setShowPoints((v) => !v)}>
            {showPoints ? "点数の設定を閉じる" : "点数を自分で設定する（改定後の値に差し替え可）"}
          </button>
          {showPoints && (
            <div style={S.grid2}>
              {Object.keys(DEFAULT_POINTS).map((k) => (
                <label key={k} style={S.label}>
                  {POINT_LABELS[k].label}
                  {POINT_LABELS[k].verified ? "" : "（令和8年度点数表で要確認）"}
                  <input style={S.input} type="number" inputMode="numeric" min="0" value={points[k]} onChange={(e) => setPoints({ ...points, [k]: Number(e.target.value) || 0 })} />
                </label>
              ))}
            </div>
          )}
        </section>

        <section style={S.noteBox}>
          <p style={S.note}>
            この計算機は費用の比較だけを扱い、処方薬と市販薬のどちらを使うべきかという医学的な判断はしません。症状が続く、原因が分からない、他の薬を飲んでいる、妊娠中や授乳中、子どもや高齢者の場合は、費用より先に医師・薬剤師に相談してください。点数は2026年9月時点の公開情報に基づく概算で、一部は令和8年度点数表での再確認が必要です。入力内容はサーバーへ送信されません。
          </p>
        </section>

        <footer style={S.footer}>
          <a href="/household" style={S.footLink}>世帯の医療費計算機</a>・
          <a href="/" style={S.footLink}>薬機レーダー</a>・
          <a href="/privacy" style={S.footLink}>プライバシーポリシー</a>
          <div style={{ marginTop: 8 }}>© 2026 Pharma-Ad Lab</div>
        </footer>
      </div>
    </>
  );
}

function Row({ k, v, total }) {
  return (
    <div style={{ ...S.row, ...(total ? S.rowTotal : {}) }}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

const S = {
  container: { maxWidth: 800, margin: "0 auto", padding: "24px 16px 40px" },
  backLink: { fontSize: 13, color: "var(--color-text-secondary)", textDecoration: "none", display: "inline-block", marginBottom: 18 },
  eyebrow: { fontSize: 12, color: "var(--color-text-info)", fontWeight: 600, margin: "0 0 6px", letterSpacing: 0.5 },
  h1: { fontSize: 24, fontWeight: 700, margin: "0 0 10px", lineHeight: 1.3 },
  h2: { fontSize: 16, fontWeight: 600, margin: "0 0 10px" },
  lead: { fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 24px", lineHeight: 1.9 },
  card: { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "18px 18px 16px", marginBottom: 16 },
  resultCard: { borderColor: "var(--color-border-info)" },
  hint: { fontSize: 12, color: "var(--color-text-secondary)", margin: "8px 0 4px", lineHeight: 1.8 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 10 },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 },
  input: { fontSize: 14, padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontFamily: "var(--font-sans)", minWidth: 0 },
  check: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.6, marginTop: 12 },
  linkBtn: { background: "none", border: "none", color: "var(--color-text-info)", fontSize: 12, padding: "6px 0", textDecoration: "underline" },
  compare: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 },
  box: { padding: "14px 16px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" },
  win: { borderColor: "var(--color-border-success)", background: "var(--color-background-success)" },
  boxTitle: { fontSize: 14, fontWeight: 600, marginBottom: 8 },
  row: { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0", color: "var(--color-text-secondary)", gap: 12 },
  rowTotal: { color: "var(--color-text-primary)", fontWeight: 700, borderTop: "0.5px solid var(--color-border-secondary)", marginTop: 6, paddingTop: 8 },
  verdict: { fontSize: 14, fontWeight: 600, margin: "16px 0 6px", lineHeight: 1.8 },
  noteBox: { padding: "4px 4px 0" },
  note: { fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, margin: "0 0 8px" },
  footer: { textAlign: "center", padding: "28px 16px 0", fontSize: 12, color: "var(--color-text-secondary)", borderTop: "0.5px solid var(--color-border-tertiary)", marginTop: 24 },
  footLink: { color: "var(--color-text-secondary)", margin: "0 6px" },
};
