import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HhShell, Tip } from "../components/HhShell";
import s from "../styles/hh.module.css";
import { CATEGORIES, CATEGORY_MAP, INCOME_TAX_RATES, summarize, compareDeductions, specialFee } from "../lib/household.mjs";

// 段階0：世帯の医療費計算機（無料・登録不要・データはブラウザ内のみ）
// 要配慮個人情報をサーバーへ送らない。保存先は localStorage だけ。

const SITE_URL = "https://med-ad-diagnostic.vercel.app";
const PAGE_URL = `${SITE_URL}/household`;
const PAGE_TITLE = "世帯の医療費計算機｜マイナポータルに載らない医療費まで集計 | 薬機レーダー";
const PAGE_DESC =
  "家族全員の医療費を、先発品の特別の料金・市販薬・自由診療などマイナポータルの医療費通知に載らない分まで集計し、医療費控除とセルフメディケーション税制のどちらが有利かを概算します。薬剤師が設計。登録不要、データはブラウザ内だけに保存。";
const STORAGE_KEY = "household-medical-v1";
const YEAR = new Date().getFullYear();
const STEPS = ["家族", "支出", "条件", "結果"];
const KANTAN_KEY = "household-kantan-v1";
const MODE_KEY = "household-mode-v1";

// かんたん入力：世帯の型と「月あたりの目安」。値は目安で、利用者が実際に合わせて変える前提
const AMOUNTS = [0, 500, 1000, 2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000, 50000];
const KCOLS = [
  { key: "insured", label: "病院・薬局の窓口", sub: "保険診療の自己負担" },
  { key: "special_brand", label: "先発品の特別の料金", sub: "領収書の「選定療養」" },
  { key: "otc", label: "市販薬", sub: "ドラッグストア" },
  { key: "private", label: "歯科などの自費", sub: "治療目的の自由診療" },
];
const cell = (insured, special_brand, otc, priv) => ({ insured, special_brand, otc, private: priv });
const TEMPLATES = [
  { key: "senior", label: "高齢のご夫婦", sub: "年金暮らし・月1回の通院", rate: "0.05", members: [["本人", cell(3000, 500, 1000, 0)], ["配偶者", cell(3000, 500, 1000, 0)]] },
  { key: "three", label: "親と同居・仕送り", sub: "親の医療費も合算できる", rate: "0.1", members: [["本人", cell(1000, 0, 1000, 0)], ["配偶者", cell(1000, 0, 1000, 0)], ["父", cell(3000, 500, 1000, 0)], ["母", cell(3000, 500, 1000, 0)]] },
  { key: "kids", label: "子育て世帯", sub: "子どもは自治体の助成で窓口0円が多い", rate: "0.1", members: [["本人", cell(1000, 0, 1500, 0)], ["配偶者", cell(1000, 0, 1500, 0)], ["子", cell(0, 0, 500, 0)]] },
  { key: "single", label: "ひとり暮らし", sub: "自分の分だけ", rate: "0.1", members: [["本人", cell(2000, 0, 1000, 0)]] },
];
const buildKantan = (tplKey) => {
  const t = TEMPLATES.find((x) => x.key === tplKey) || TEMPLATES[0];
  return {
    template: t.key,
    months: "12",
    members: t.members.map(([name, c]) => ({ id: uid(), name, cells: { ...c } })),
    selfmedAll: true,
    reimbursed: "",
    incomeTaxRate: t.rate,
    selfMedQualifies: true,
  };
};
function loadKantan() {
  try {
    const raw = window.localStorage.getItem(KANTAN_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && Array.isArray(p.members)) return p;
  } catch {
    /* noop */
  }
  return null;
}
function kantanToEntries(k) {
  const months = Number(k.months) || 12;
  const out = [];
  for (const m of k.members) {
    for (const col of KCOLS) {
      const monthly = Number(m.cells?.[col.key]) || 0;
      if (monthly <= 0) continue;
      out.push({ id: `${m.id}-${col.key}`, memberId: m.id, category: col.key, amount: monthly * months, treatment: true, selfmedMark: col.key === "otc" ? !!k.selfmedAll : undefined });
    }
  }
  return out;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const yen = (n) => `${Math.round(n || 0).toLocaleString("ja-JP")}円`;

const DEFAULT_STATE = {
  members: [
    { id: "self", name: "本人" },
    { id: "spouse", name: "配偶者" },
  ],
  entries: [],
  settings: { reimbursed: "", totalIncome: "", incomeTaxRate: "0.1", selfMedQualifies: true },
};

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.members) || !Array.isArray(p.entries)) return null;
    return { ...DEFAULT_STATE, ...p, settings: { ...DEFAULT_STATE.settings, ...(p.settings || {}) } };
  } catch {
    return null;
  }
}
function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* プライベートモード等では保存しない */
  }
}

const TIPS = {
  insured: "病院・薬局の窓口で払った保険診療の自己負担分です。マイナポータル連携で医療費通知として自動取得でき、確定申告書に自動入力されます。",
  special_brand: (
    <>
      ジェネリックがある先発品を患者の希望で使うと、薬価差の一部を「特別の料金」として別に払います（2024年10月開始、2026年6月から差額の2分の1）。厚労省の疑義解釈で医療費控除の対象とされる一方、保険給付の外なので医療費通知には載りません。薬局の領収書の「選定療養」の行を確認してください。
      <br />
      <a href="https://www.mhlw.go.jp/stf/newpage_39830.html" target="_blank" rel="noopener noreferrer">厚生労働省：長期収載品の選定療養について</a>
    </>
  ),
  otc: "風邪薬・鎮痛薬・湿布など治療目的で買った市販薬は医療費控除の対象です。セルフメディケーション税制の対象品は、パッケージの共通識別マークかレシートの★印で分かります。ビタミン剤や予防目的のものは対象外です。",
  private: "歯科の自費治療や眼科の治療など、治療目的の自由診療は医療費控除の対象です。美容目的は対象外です。",
  transport: "電車・バスの運賃は対象です。自家用車のガソリン代・駐車場代は対象外です。",
  excluded: "眼鏡・サプリメント・健康診断・美容・ペットの医療費は、家計としては医療支出ですが医療費控除の対象になりません。世帯の支出全体を把握するために記録できます。",
};

export default function Household() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState("kantan");
  const [kantan, setKantan] = useState(() => buildKantan("senior"));
  const [newMember, setNewMember] = useState("");
  const [form, setForm] = useState({ memberId: "self", category: "insured", amount: "", memo: "", treatment: true, selfmedMark: false });
  const [fee, setFee] = useState({ brandPrice: "", genericPrice: "", quantity: "30", ratio: "0.5" });
  const [showFee, setShowFee] = useState(false);

  useEffect(() => {
    const st = loadState();
    if (st) {
      setState(st);
      if (st.entries.length > 0) setStep(4);
    }
    const k = loadKantan();
    if (k) setKantan(k);
    try {
      const m = window.localStorage.getItem(MODE_KEY);
      if (m === "detail" || m === "kantan") setMode(m);
      else if (st && st.entries.length > 0) setMode("detail");
    } catch {
      /* noop */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(KANTAN_KEY, JSON.stringify(kantan));
      window.localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* noop */
    }
  }, [kantan, mode, loaded]);

  const detail = state;
  const kantanEntries = useMemo(() => kantanToEntries(kantan), [kantan]);
  const isKantan = mode === "kantan";
  const members = isKantan ? kantan.members : detail.members;
  const entries = isKantan ? kantanEntries : detail.entries;
  const settings = isKantan
    ? { reimbursed: kantan.reimbursed, totalIncome: "", incomeTaxRate: kantan.incomeTaxRate, selfMedQualifies: kantan.selfMedQualifies }
    : detail.settings;
  const summary = useMemo(() => summarize(entries), [entries]);
  const result = useMemo(
    () => compareDeductions({ summary, reimbursed: settings.reimbursed, totalIncome: settings.totalIncome, incomeTaxRate: Number(settings.incomeTaxRate), selfMedQualifies: settings.selfMedQualifies }),
    [summary, settings]
  );
  const setK = (patch) => setKantan((k) => ({ ...k, ...patch }));
  const setKCell = (id, key, v) => setKantan((k) => ({ ...k, members: k.members.map((m) => (m.id === id ? { ...m, cells: { ...m.cells, [key]: Number(v) } } : m)) }));
  const setKName = (id, name) => setKantan((k) => ({ ...k, members: k.members.map((m) => (m.id === id ? { ...m, name } : m)) }));
  const addKMember = () => setKantan((k) => ({ ...k, members: [...k.members, { id: uid(), name: "家族", cells: cell(0, 0, 0, 0) }] }));
  const removeKMember = (id) => setKantan((k) => (k.members.length <= 1 ? k : { ...k, members: k.members.filter((m) => m.id !== id) }));
  const monthsN = Number(kantan.months) || 12;
  const feeResult = useMemo(() => specialFee({ brandPrice: fee.brandPrice, genericPrice: fee.genericPrice, quantity: fee.quantity, ratio: Number(fee.ratio) }), [fee]);

  const update = (patch) => setState((st) => ({ ...st, ...patch }));
  const updateSettings = (patch) => setState((st) => ({ ...st, settings: { ...st.settings, ...patch } }));
  const goto = (n) => {
    setStep(n);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addMember = () => {
    const name = newMember.trim();
    if (!name) return;
    update({ members: [...detail.members, { id: uid(), name }] });
    setNewMember("");
  };
  const removeMember = (id) => {
    if (detail.members.length <= 1) return;
    update({ members: detail.members.filter((m) => m.id !== id), entries: detail.entries.filter((e) => e.memberId !== id) });
    if (form.memberId === id) setForm((f) => ({ ...f, memberId: detail.members[0].id }));
  };
  const addEntry = () => {
    const amount = Math.floor(Number(form.amount));
    if (!(amount > 0)) return;
    const entry = {
      id: uid(),
      memberId: form.memberId,
      category: form.category,
      amount,
      memo: form.memo.trim(),
      treatment: form.category === "otc" ? form.treatment : undefined,
      selfmedMark: form.category === "otc" ? form.selfmedMark : undefined,
    };
    update({ entries: [entry, ...detail.entries] });
    setForm((f) => ({ ...f, amount: "", memo: "" }));
  };
  const removeEntry = (id) => update({ entries: detail.entries.filter((e) => e.id !== id) });
  const clearAll = () => {
    if (!window.confirm("このブラウザに保存している入力をすべて消します。よろしいですか？")) return;
    setState(DEFAULT_STATE);
    setKantan(buildKantan("senior"));
    setStep(1);
  };
  const memberName = (id) => members.find((m) => m.id === id)?.name || "（削除済み）";

  const betterLabel = result.better === "medical" ? "医療費控除" : result.better === "selfMed" ? "セルフメディケーション税制" : null;
  const maxSaving = Math.max(result.medicalSaving.total, result.selfMedSaving.total, 1);

  return (
    <HhShell current="household">
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
        <meta name="twitter:site" content="@Pharma_Ad_Lab" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESC} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "世帯の医療費計算機",
              url: PAGE_URL,
              applicationCategory: "FinanceApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
              description: PAGE_DESC,
              publisher: { "@type": "Organization", name: "Pharma-Ad Lab" },
            }),
          }}
        />
      </Head>

      <div className={s.hero}>
        <div>
          <h1 className={s.h1}>
            家族の医療費を、<em>マイナポータルに載らない分</em>まで一つの財布で見る
          </h1>
          <p className={s.lead}>
            先発品を希望したときの特別の料金、市販薬、治療目的の自由診療は、医療費控除の対象なのに医療費通知には載りません。世帯でまとめて集計し、医療費控除とセルフメディケーション税制のどちらが有利かを概算します。
          </p>
          <div className={s.trust}>
            <span>無料・登録不要</span>
            <span>入力内容はサーバーへ送信しない</span>
            <span>薬剤師が設計</span>
          </div>
        </div>
        <aside className={s.heroAside}>
          <h2>用意するもの</h2>
          <ul>
            <li>薬局・病院の領収書（「選定療養」「特別の料金」の行に注目）</li>
            <li>ドラッグストアのレシート（★印はセルフメディケーション税制の対象）</li>
            <li>歯科・眼科などの自費の領収書</li>
            <li>申告する人の所得税率（源泉徴収票の課税所得から）</li>
          </ul>
        </aside>
      </div>

      <div className={s.modeBar} role="tablist" aria-label="入力方法">
        <button type="button" role="tab" aria-selected={isKantan} className={[s.modeBtn, isKantan ? s.modeOn : ""].join(" ")} onClick={() => setMode("kantan")}>かんたん入力（月の目安から）</button>
        <button type="button" role="tab" aria-selected={!isKantan} className={[s.modeBtn, !isKantan ? s.modeOn : ""].join(" ")} onClick={() => setMode("detail")}>くわしく入力（領収書1件ずつ）</button>
      </div>

      {isKantan && (
        <section className={`${s.panel} ${s.big}`}>
          <div className={s.panelHead}><span className={s.kicker}>かんたん入力</span><h2 className={s.h2}>世帯の型を選ぶ</h2></div>
          <p className={s.desc}>近い型を選ぶと、家族と月あたりの目安があらかじめ入ります。目安は実際に合わせて変えてください。結果は下に自動で出ます。</p>
          <div className={s.tplGrid} role="radiogroup" aria-label="世帯の型">
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" role="radio" aria-checked={kantan.template === t.key} className={[s.tpl, kantan.template === t.key ? s.tplOn : ""].join(" ")} onClick={() => setKantan(buildKantan(t.key))}>
                <span className={s.tplTitle}>{t.label}</span>
                <span className={s.tplSub}>{t.sub}</span>
              </button>
            ))}
          </div>

          <h3 className={s.h3}>月あたりの目安（1人ずつ）</h3>
          <span className={s.estimate}>あらかじめ入っている金額は目安です</span>
          <div className={s.gridWrap}>
            <table className={s.gridTable}>
              <thead>
                <tr>
                  <th>家族</th>
                  {KCOLS.map((c) => (
                    <th key={c.key}>{c.label}<br /><span style={{ fontWeight: 400 }}>{c.sub}</span></th>
                  ))}
                  <th className={s.rowTotal}>年間</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {kantan.members.map((m) => {
                  const rowSum = KCOLS.reduce((a, c) => a + (Number(m.cells?.[c.key]) || 0), 0) * monthsN;
                  return (
                    <tr key={m.id}>
                      <td className={s.nameCell} data-label="家族"><input className={`${s.input} ${s.nameInput}`} value={m.name} aria-label="家族の呼び名" onChange={(e) => setKName(m.id, e.target.value)} /></td>
                      {KCOLS.map((c) => (
                        <td key={c.key} data-label={`${c.label}（月）`}>
                          <select className={s.input} aria-label={`${m.name}の${c.label}（月あたり）`} value={String(Number(m.cells?.[c.key]) || 0)} onChange={(e) => setKCell(m.id, c.key, e.target.value)}>
                            {AMOUNTS.map((a) => <option key={a} value={String(a)}>{a === 0 ? "なし" : `${a.toLocaleString("ja-JP")}円`}</option>)}
                          </select>
                        </td>
                      ))}
                      <td className={s.rowTotal} data-label="年間">{yen(rowSum)}</td>
                      <td className={s.actCell}><button type="button" className={s.btnGhost} onClick={() => removeKMember(m.id)} aria-label={`${m.name}を削除`}>削除</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={s.btnRow}>
            <button type="button" className={s.btnSecondary} onClick={addKMember}>家族を1人追加</button>
            <span className={s.help}>別居の親でも、仕送りしていれば合算できます。</span>
          </div>

          <h3 className={s.h3}>条件（あらかじめ入っています）</h3>
          <div className={s.grid}>
            <div className={s.field}>
              <label className={s.label} htmlFor="kMonths">何か月分で計算するか</label>
              <select id="kMonths" className={s.input} value={kantan.months} onChange={(e) => setK({ months: e.target.value })}>
                <option value="12">12か月（1年分）</option>
                <option value="6">6か月</option>
                <option value="3">3か月</option>
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="kRate">申告する人の所得税率</label>
              <select id="kRate" className={s.input} value={kantan.incomeTaxRate} onChange={(e) => setK({ incomeTaxRate: e.target.value })}>
                {INCOME_TAX_RATES.map((r) => <option key={r.rate} value={String(r.rate)}>{r.label}</option>)}
              </select>
              <p className={s.help}>年金だけの世帯はおおむね5%です。働いている子が親の分を申告するなら、その子の税率にします。</p>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="kReimb">高額療養費・保険金で戻った額（円、年間）</label>
              <input id="kReimb" className={s.input} type="number" inputMode="numeric" min="0" placeholder="0" value={kantan.reimbursed} onChange={(e) => setK({ reimbursed: e.target.value })} />
            </div>
          </div>
          <div className={s.checks}>
            <label className={s.check}><input type="checkbox" checked={kantan.selfMedQualifies} onChange={(e) => setK({ selfMedQualifies: e.target.checked })} />健康診断・特定健診・予防接種のどれかをその年に受けている（セルフメディケーション税制の要件）</label>
            <label className={s.check}><input type="checkbox" checked={kantan.selfmedAll} onChange={(e) => setK({ selfmedAll: e.target.checked })} />買っている市販薬は、おおむね★印（セルフメディケーション税制の対象品）</label>
          </div>
          <div className={s.btnRow}>
            <span className={s.help}>領収書1件ずつ正確に入れたい場合は</span>
            <button type="button" className={s.btnGhost} onClick={() => setMode("detail")}>くわしく入力に切り替える</button>
          </div>
        </section>
      )}

      {!isKantan && (
      <ol className={s.steps} aria-label="入力の手順">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const cls = [s.step, step === n ? s.stepCurrent : "", step > n ? s.stepDone : ""].join(" ");
          return (
            <li key={label} style={{ display: "contents" }}>
              <button type="button" className={cls} onClick={() => goto(n)} aria-current={step === n ? "step" : undefined}>
                <span className={s.stepNum}>{step > n ? "✓" : n}</span>
                <span className={s.stepLabel}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      )}

      {!isKantan && step === 1 && (
        <section className={s.panel}>
          <div className={s.panelHead}>
            <span className={s.kicker}>STEP 1</span>
            <h2 className={s.h2}>家族を登録する</h2>
          </div>
          <p className={s.desc}>
            医療費控除は「生計を一にする」家族の分を合算できます。同居していなくても、仕送りしている親や下宿中の子どもは含められます。ペットは控除対象外ですが、世帯の支出として記録するなら家族に加えてください。
          </p>
          <div className={s.chips}>
            {members.map((m) => (
              <span key={m.id} className={s.chip}>
                {m.name}
                <button type="button" className={s.chipX} onClick={() => removeMember(m.id)} aria-label={`${m.name}を削除`}>×</button>
              </span>
            ))}
          </div>
          <div className={s.grid}>
            <div className={s.field}>
              <label className={s.label} htmlFor="newMember">追加する家族の呼び名</label>
              <input id="newMember" className={s.input} placeholder="例：長女、父（別居）" value={newMember} onChange={(e) => setNewMember(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember()} />
              <p className={s.help}>名前でなく続柄で構いません。この情報はブラウザの外に出ません。</p>
            </div>
          </div>
          <div className={s.btnRow}>
            <button type="button" className={s.btnSecondary} onClick={addMember}>家族を追加</button>
            <span className={s.spacer} />
            <button type="button" className={s.btnPrimary} onClick={() => goto(2)}>次へ：支出を入力する</button>
          </div>
        </section>
      )}

      {!isKantan && step === 2 && (
        <section className={s.panel}>
          <div className={s.panelHead}>
            <span className={s.kicker}>STEP 2</span>
            <h2 className={s.h2}>{YEAR}年の医療支出を記録する</h2>
          </div>
          <p className={s.desc}>種類を選び、誰の支出かと金額を入れて「記録する」を押します。何件でも追加できます。</p>

          <div className={s.field}>
            <span className={s.label}>種類 <span className={s.req}>必須</span></span>
            <div className={s.catGrid} role="radiogroup" aria-label="支出の種類">
              {CATEGORIES.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={form.category === c.key} className={[s.cat, form.category === c.key ? s.catOn : ""].join(" ")} onClick={() => setForm({ ...form, category: c.key })}>
                  <span className={s.catTitle}>{c.label}</span>
                  <span className={s.catMeta}>
                    {c.notice ? <span className={`${s.badge} ${s.badgeGray}`}>通知に載る</span> : <span className={`${s.badge} ${s.badgeMint}`}>通知に載らない</span>}
                    {c.deductible === false ? <span className={`${s.badge} ${s.badgeGray}`}>控除対象外</span> : <span className={`${s.badge} ${s.badgeGray}`}>控除対象</span>}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span className={s.help}>{CATEGORY_MAP[form.category].hint}</span>
              <Tip label={CATEGORY_MAP[form.category].label}>{TIPS[form.category]}</Tip>
            </div>
          </div>

          {form.category === "special_brand" && (
            <div style={{ marginTop: 10 }}>
              <button type="button" className={s.btnGhost} onClick={() => setShowFee((v) => !v)}>
                {showFee ? "薬価からの計算を閉じる" : "領収書に金額がない場合：薬価から特別の料金を計算する"}
              </button>
              {showFee && (
                <div className={s.tipBody}>
                  <div className={s.grid}>
                    <div className={s.field}><label className={s.label}>先発品の薬価（1錠あたり、円）</label><input className={s.input} type="number" inputMode="decimal" min="0" value={fee.brandPrice} onChange={(e) => setFee({ ...fee, brandPrice: e.target.value })} /></div>
                    <div className={s.field}><label className={s.label}>後発品の薬価（同じ単位、円）</label><input className={s.input} type="number" inputMode="decimal" min="0" value={fee.genericPrice} onChange={(e) => setFee({ ...fee, genericPrice: e.target.value })} /></div>
                    <div className={s.field}><label className={s.label}>数量</label><input className={s.input} type="number" inputMode="numeric" min="0" value={fee.quantity} onChange={(e) => setFee({ ...fee, quantity: e.target.value })} /></div>
                    <div className={s.field}><label className={s.label}>調剤の時期</label>
                      <select className={s.input} value={fee.ratio} onChange={(e) => setFee({ ...fee, ratio: e.target.value })}>
                        <option value="0.5">2026年6月以降（差額の2分の1）</option>
                        <option value="0.25">2024年10月〜2026年5月（差額の4分の1）</option>
                      </select>
                    </div>
                  </div>
                  <div className={s.btnRow}>
                    <span>特別の料金の目安：<strong style={{ fontSize: 18 }}>{yen(feeResult.fee)}</strong>（消費税込み・概算）</span>
                    {feeResult.fee > 0 && <button type="button" className={s.btnSecondary} onClick={() => setForm({ ...form, amount: String(feeResult.fee), memo: form.memo || "先発品の特別の料金" })}>金額欄に入れる</button>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={s.grid} style={{ marginTop: 16 }}>
            <div className={s.field}>
              <label className={s.label} htmlFor="who">誰の支出か <span className={s.req}>必須</span></label>
              <select id="who" className={s.input} value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="amount">金額（円） <span className={s.req}>必須</span></label>
              <input id="amount" className={s.input} type="number" inputMode="numeric" min="0" placeholder="例：3200" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addEntry()} />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="memo">メモ（任意）</label>
              <input id="memo" className={s.input} placeholder="例：○○内科 3月分" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addEntry()} />
            </div>
          </div>
          {form.category === "otc" && (
            <div className={s.checks}>
              <label className={s.check}><input type="checkbox" checked={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.checked })} />治療目的で買った（風邪薬・鎮痛薬・湿布など。ビタミン剤や予防目的は外す）</label>
              <label className={s.check}><input type="checkbox" checked={form.selfmedMark} onChange={(e) => setForm({ ...form, selfmedMark: e.target.checked })} />セルフメディケーション税制の対象品（パッケージの共通識別マーク、またはレシートの★印）</label>
            </div>
          )}
          <div className={s.btnRow}>
            <button type="button" className={s.btnPrimary} onClick={addEntry}>記録する</button>
            <span className={s.help}>登録済み {entries.length} 件</span>
          </div>

          {entries.length > 0 && (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>誰</th><th>種類</th><th className={s.num}>金額</th><th>メモ</th><th></th></tr></thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td>{memberName(e.memberId)}</td>
                      <td>
                        {CATEGORY_MAP[e.category]?.label}{" "}
                        {!CATEGORY_MAP[e.category]?.notice && <span className={`${s.badge} ${s.badgeMint}`}>通知に載らない</span>}{" "}
                        {e.category === "otc" && e.selfmedMark && <span className={`${s.badge} ${s.badgeGray}`}>セルフメディ対象</span>}
                        {e.category === "otc" && e.treatment === false && <span className={`${s.badge} ${s.badgeWarn}`}>控除対象外</span>}
                      </td>
                      <td className={s.num}>{yen(e.amount)}</td>
                      <td>{e.memo}</td>
                      <td><button type="button" className={s.btnGhost} onClick={() => removeEntry(e.id)}>削除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className={s.btnRow}>
            <button type="button" className={s.btnSecondary} onClick={() => goto(1)}>戻る</button>
            <span className={s.spacer} />
            <button type="button" className={s.btnPrimary} onClick={() => goto(3)}>次へ：申告する人の条件</button>
          </div>
        </section>
      )}

      {!isKantan && step === 3 && (
        <section className={s.panel}>
          <div className={s.panelHead}>
            <span className={s.kicker}>STEP 3</span>
            <h2 className={s.h2}>申告する人の条件</h2>
          </div>
          <p className={s.desc}>世帯で一番所得の高い人が申告すると、戻る税金が大きくなります。分からない項目は空欄のままで構いません。</p>
          <div className={s.grid}>
            <div className={s.field}>
              <label className={s.label} htmlFor="reimb">保険金・高額療養費などで補填された額（円）</label>
              <input id="reimb" className={s.input} type="number" inputMode="numeric" min="0" placeholder="0" value={settings.reimbursed} onChange={(e) => updateSettings({ reimbursed: e.target.value })} />
              <p className={s.help}>入院給付金や出産育児一時金など、その医療費に対して受け取ったお金です。</p>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="income">総所得金額等（200万円未満のときだけ）</label>
              <input id="income" className={s.input} type="number" inputMode="numeric" min="0" placeholder="未入力なら足切り10万円" value={settings.totalIncome} onChange={(e) => updateSettings({ totalIncome: e.target.value })} />
              <p className={s.help}>200万円未満の人は、医療費控除の足切りが「総所得の5%」に下がります。</p>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="rate">所得税率</label>
              <select id="rate" className={s.input} value={settings.incomeTaxRate} onChange={(e) => updateSettings({ incomeTaxRate: e.target.value })}>
                {INCOME_TAX_RATES.map((r) => <option key={r.rate} value={String(r.rate)}>{r.label}</option>)}
              </select>
              <p className={s.help}>源泉徴収票の「給与所得控除後の金額」から「所得控除の額の合計額」を引いた課税所得で判定します。</p>
            </div>
          </div>
          <div className={s.checks}>
            <label className={s.check}>
              <input type="checkbox" checked={settings.selfMedQualifies} onChange={(e) => updateSettings({ selfMedQualifies: e.target.checked })} />
              健康診断・予防接種・がん検診などの「一定の取組」をその年に受けている（セルフメディケーション税制の要件。会社の定期健診でも可）
            </label>
          </div>
          <div className={s.btnRow}>
            <button type="button" className={s.btnSecondary} onClick={() => goto(2)}>戻る</button>
            <span className={s.spacer} />
            <button type="button" className={s.btnPrimary} onClick={() => goto(4)}>結果を見る</button>
          </div>
        </section>
      )}

      {(isKantan || step === 4) && (
        <>
          <section className={`${s.panel} ${isKantan ? s.big : ""}`}>
            <div className={s.panelHead}>
              <span className={s.kicker}>{isKantan ? "結果" : "STEP 4"}</span>
              <h2 className={s.h2}>世帯の結果（概算）</h2>
            </div>
            <div className={s.kpis}>
              <div className={s.kpi}><div className={s.kpiLabel}>世帯の医療支出</div><div className={s.kpiValue}>{yen(summary.total)}</div><div className={s.kpiSub}>{members.length}人・{entries.length}件</div></div>
              <div className={s.kpi}><div className={s.kpiLabel}>医療費通知に載る分</div><div className={s.kpiValue}>{yen(summary.inNotice)}</div><div className={s.kpiSub}>マイナポータルで自動取得できる</div></div>
              <div className={`${s.kpi} ${s.kpiHot}`}><div className={s.kpiLabel}>載らない分</div><div className={s.kpiValue}>{yen(summary.notInNotice)}</div><div className={s.kpiSub}>領収書を保管する</div></div>
              <div className={`${s.kpi} ${s.kpiHot}`}><div className={s.kpiLabel}>うち医療費控除に入れられる額</div><div className={s.kpiValue}>{yen(summary.deductibleNotInNotice)}</div><div className={s.kpiSub}>通知だけで申告すると漏れる金額</div></div>
            </div>

            <div className={[s.verdict, betterLabel ? "" : s.verdictNeutral].join(" ")}>
              <span className={s.verdictIcon} aria-hidden="true">{betterLabel ? "✓" : "i"}</span>
              <div>
                <p className={s.verdictTitle}>{betterLabel ? `この世帯は「${betterLabel}」で申告する方が有利です` : "現時点では、どちらの制度でも控除額は0円です"}</p>
                <p className={s.verdictText}>
                  {betterLabel
                    ? `戻る税金の目安は ${yen(result.better === "medical" ? result.medicalSaving.total : result.selfMedSaving.total)} です。2つの制度は選択制で、併用はできません。`
                    : "載らない分（特別の料金・市販薬・自由診療）の入力漏れがないか確認してください。医療費控除の足切りは10万円、セルフメディケーション税制は12,000円です。"}
                </p>
              </div>
            </div>

            <h3 className={s.h3}>戻る税金の目安を比べる</h3>
            <div className={s.chart} role="img" aria-label={`医療費控除 ${yen(result.medicalSaving.total)}、セルフメディケーション税制 ${yen(result.selfMedSaving.total)}`}>
              <div className={s.chartRow}>
                <span className={s.chartName}><span className={s.swatch} style={{ background: "#1d4ed8" }} />医療費控除</span>
                <div className={s.bar}><div className={s.barFill} style={{ width: `${(result.medicalSaving.total / maxSaving) * 100}%`, background: "#1d4ed8" }} /></div>
                <span className={s.chartVal}>{yen(result.medicalSaving.total)}</span>
              </div>
              <div className={s.chartRow}>
                <span className={s.chartName}><span className={s.swatch} style={{ background: "#0f9d8a" }} />セルフメディケーション税制</span>
                <div className={s.bar}><div className={s.barFill} style={{ width: `${(result.selfMedSaving.total / maxSaving) * 100}%`, background: "#0f9d8a" }} /></div>
                <span className={s.chartVal}>{yen(result.selfMedSaving.total)}</span>
              </div>
            </div>

            <div className={s.breakdown}>
              <div className={[s.bd, result.better === "medical" ? s.bdWin : ""].join(" ")}>
                <div className={s.bdTitle}><span className={s.swatch} style={{ background: "#1d4ed8" }} />医療費控除</div>
                <div className={s.bdRow}><span>対象医療費</span><span>{yen(summary.deductible)}</span></div>
                <div className={s.bdRow}><span>補填された額</span><span>−{yen(settings.reimbursed)}</span></div>
                <div className={s.bdRow}><span>足切り額</span><span>−{yen(result.medical.threshold)}</span></div>
                <div className={s.bdRow}><span>控除額（上限200万円）</span><span>{yen(result.medical.amount)}</span></div>
                <div className={`${s.bdRow} ${s.bdTotal}`}><span>戻る税金の目安</span><span>{yen(result.medicalSaving.total)}</span></div>
              </div>
              <div className={[s.bd, result.better === "selfMed" ? s.bdWin : ""].join(" ")}>
                <div className={s.bdTitle}><span className={s.swatch} style={{ background: "#0f9d8a" }} />セルフメディケーション税制</div>
                <div className={s.bdRow}><span>対象医薬品の購入額</span><span>{yen(summary.selfMed)}</span></div>
                <div className={s.bdRow}><span>足切り額</span><span>−12,000円</span></div>
                <div className={s.bdRow}><span>控除額（上限88,000円）</span><span>{yen(result.selfMed.amount)}</span></div>
                <div className={`${s.bdRow} ${s.bdTotal}`}><span>戻る税金の目安</span><span>{yen(result.selfMedSaving.total)}</span></div>
                {result.selfMed.reason && <p className={s.help} style={{ marginTop: 6 }}>{result.selfMed.reason}</p>}
              </div>
            </div>

            <h3 className={s.h3}>家族ごとの内訳</h3>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>家族</th><th className={s.num}>支出</th><th className={s.num}>うち通知に載らない分</th></tr></thead>
                <tbody>
                  {members.map((m) => {
                    const own = entries.filter((e) => e.memberId === m.id);
                    const notIn = own.filter((e) => !CATEGORY_MAP[e.category]?.notice).reduce((a, e) => a + (Number(e.amount) || 0), 0);
                    return (
                      <tr key={m.id}><td>{m.name}</td><td className={s.num}>{yen(summary.byMember[m.id])}</td><td className={s.num}>{yen(notIn)}</td></tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className={s.notice}>
              戻る税金は、控除額×所得税率（復興特別所得税を含む）＋控除額×住民税率10%の概算です。実際の還付額は他の控除や源泉徴収額で変わります。申告は国税庁の確定申告書等作成コーナーか税理士へ。この計算機は「載らない分を落とさないためのチェックリスト」としてお使いください。
            </p>
            <div className={s.btnRow}>
              {!isKantan && <button type="button" className={s.btnSecondary} onClick={() => goto(2)}>支出を追加・修正する</button>}
              <span className={s.spacer} />
              <button type="button" className={s.btnGhost} onClick={clearAll}>このブラウザの入力をすべて消す</button>
            </div>
          </section>

          <section className={s.panel} style={{ background: "var(--blue-bg)", borderColor: "var(--blue-line)" }}>
            <div className={s.panelHead}><span className={s.kicker}>次の一歩</span><h2 className={s.h2}>その薬、処方でもらうのと市販薬で買うのとどちらが安いか</h2></div>
            <p className={s.desc}>単発の症状なら、再診料や調剤料を含めると市販薬の方が安いことがあります。薬価と市販薬の価格から、受診の時間まで含めて比べる計算機を用意しました。</p>
            <Link href="/rx-or-otc" className={s.btnMint}>処方か市販薬か、自己負担で比べる →</Link>
          </section>

          <section className={s.panel} style={{ background: "var(--mint-bg)", borderColor: "var(--mint-line)" }}>
            <div className={s.panelHead}><span className={s.kicker} style={{ color: "var(--mint-deep)" }}>薬のリスト整理</span><h2 className={s.h2}>親の薬、どれが市販薬で済むか。お薬手帳を貼るだけ</h2></div>
            <p className={s.desc}>薬のリストを貼ると、薬剤師が設計したAIが「処方のままが自然」「市販薬で済む可能性」「医師・薬剤師に確認」に分けます。無料、登録不要、リストは保存しません。</p>
            <Link href="/soudan" className={s.btnMint}>薬のリストを整理する →</Link>
          </section>
        </>
      )}

      <section className={s.basis}>
        <h2>根拠と確認日</h2>
        <ul>
          <li>医療費控除：<a href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1120.htm" target="_blank" rel="noopener noreferrer">国税庁 No.1120</a>。（支払った医療費 − 補填額）− 10万円（総所得200万円未満は5%）、上限200万円。確認日 2026-09-07</li>
          <li>セルフメディケーション税制：<a href="https://www.nta.go.jp/taxes/shiraberu/shinkoku/tokushu/keisubetsu/self-medication.htm" target="_blank" rel="noopener noreferrer">国税庁</a>。対象医薬品の購入額 − 12,000円、上限88,000円。医療費控除と選択制。確認日 2026-09-07</li>
          <li>長期収載品の特別の料金：<a href="https://www.mhlw.go.jp/stf/newpage_39830.html" target="_blank" rel="noopener noreferrer">厚生労働省</a>。2024年10月開始、2026年6月から価格差の2分の1。医療費控除の対象、医療費通知には反映されない。確認日 2026-09-07</li>
          <li>家族分の医療費通知の取得：<a href="https://faq.myna.go.jp/faq/show/7116?site_domain=default" target="_blank" rel="noopener noreferrer">マイナポータル よくある質問</a>。代理人設定が必要。確認日 2026-09-07</li>
        </ul>
        <p className={s.help} style={{ marginTop: 10 }}>このページは薬剤師が設計した家計向けの計算機で、税務・医療の判断を代替するものではありません。入力内容はお使いのブラウザにのみ保存され、当サイトのサーバーには送信されません。</p>
      </section>
    </HhShell>
  );
}
