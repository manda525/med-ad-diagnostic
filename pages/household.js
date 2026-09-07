import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_MAP,
  INCOME_TAX_RATES,
  summarize,
  compareDeductions,
  specialFee,
} from "../lib/household.mjs";

// 段階0：世帯の医療費計算機（無料・登録不要・データはブラウザ内のみ）
// 要配慮個人情報をサーバーへ送らない。保存先は localStorage だけ。

const SITE_URL = "https://med-ad-diagnostic.vercel.app";
const PAGE_URL = `${SITE_URL}/household`;
const PAGE_TITLE = "世帯の医療費計算機｜マイナポータルに載らない医療費まで集計 | 薬機レーダー";
const PAGE_DESC =
  "家族全員の医療費を、先発品の特別の料金・市販薬・自由診療などマイナポータルの医療費通知に載らない分まで集計し、医療費控除とセルフメディケーション税制のどちらが有利かを概算します。薬剤師が設計。登録不要、データはブラウザ内だけに保存。";
const STORAGE_KEY = "household-medical-v1";
const YEAR = new Date().getFullYear();

const uid = () => Math.random().toString(36).slice(2, 10);
const yen = (n) => `${Math.round(n || 0).toLocaleString("ja-JP")}円`;

const DEFAULT_STATE = {
  members: [
    { id: "self", name: "本人" },
    { id: "spouse", name: "配偶者" },
  ],
  entries: [],
  settings: {
    reimbursed: "",
    totalIncome: "",
    incomeTaxRate: "0.1",
    selfMedQualifies: true,
  },
};

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.members) || !Array.isArray(parsed.entries)) return null;
    return { ...DEFAULT_STATE, ...parsed, settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) } };
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 保存できない環境（プライベートモード等）では黙って続行 */
  }
}

export default function Household() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [newMember, setNewMember] = useState("");
  const [form, setForm] = useState({
    memberId: "self",
    category: "insured",
    amount: "",
    memo: "",
    treatment: true,
    selfmedMark: false,
  });
  const [fee, setFee] = useState({ brandPrice: "", genericPrice: "", quantity: "30", ratio: "0.5" });

  useEffect(() => {
    const s = loadState();
    if (s) setState(s);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);

  const { members, entries, settings } = state;
  const summary = useMemo(() => summarize(entries), [entries]);
  const result = useMemo(
    () =>
      compareDeductions({
        summary,
        reimbursed: settings.reimbursed,
        totalIncome: settings.totalIncome,
        incomeTaxRate: Number(settings.incomeTaxRate),
        selfMedQualifies: settings.selfMedQualifies,
      }),
    [summary, settings]
  );
  const feeResult = useMemo(
    () =>
      specialFee({
        brandPrice: fee.brandPrice,
        genericPrice: fee.genericPrice,
        quantity: fee.quantity,
        ratio: Number(fee.ratio),
      }),
    [fee]
  );

  const update = (patch) => setState((s) => ({ ...s, ...patch }));
  const updateSettings = (patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));

  const addMember = () => {
    const name = newMember.trim();
    if (!name) return;
    update({ members: [...members, { id: uid(), name }] });
    setNewMember("");
  };

  const removeMember = (id) => {
    if (members.length <= 1) return;
    update({
      members: members.filter((m) => m.id !== id),
      entries: entries.filter((e) => e.memberId !== id),
    });
    if (form.memberId === id) setForm((f) => ({ ...f, memberId: members[0].id }));
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
    update({ entries: [entry, ...entries] });
    setForm((f) => ({ ...f, amount: "", memo: "" }));
  };

  const removeEntry = (id) => update({ entries: entries.filter((e) => e.id !== id) });

  const clearAll = () => {
    if (!window.confirm("このブラウザに保存している入力をすべて消します。よろしいですか？")) return;
    setState(DEFAULT_STATE);
  };

  const memberName = (id) => members.find((m) => m.id === id)?.name || "（削除済み）";
  const betterLabel =
    result.better === "medical"
      ? "医療費控除"
      : result.better === "selfMed"
      ? "セルフメディケーション税制"
      : null;

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

      <div style={S.container}>
        <Link href="/" style={S.backLink}>
          ← 薬機レーダーに戻る
        </Link>
        <p style={S.eyebrow}>無料・登録不要・薬剤師が設計</p>
        <h1 style={S.h1}>世帯の医療費計算機</h1>
        <p style={S.lead}>
          家族全員の医療費を、マイナポータルの医療費通知に【載らない分】まで含めて集計します。先発品を希望したときの特別の料金、市販薬、治療目的の自由診療は、医療費控除の対象なのに通知には載りません。入力したデータはこのブラウザの中にだけ保存され、サーバーには送られません。
        </p>

        {/* 1. 家族 */}
        <section style={S.card}>
          <h2 style={S.h2}>1. 家族（生計を一にする人）</h2>
          <p style={S.hint}>
            同居していなくても、仕送りしている親や下宿中の子どもは「生計を一にする」として合算できます。ペットは控除対象外なので、記録するなら「控除対象外」に入れてください。
          </p>
          <div style={S.chips}>
            {members.map((m) => (
              <span key={m.id} style={S.chip}>
                {m.name}
                <button type="button" style={S.chipX} onClick={() => removeMember(m.id)} aria-label={`${m.name}を削除`}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={S.row}>
            <input
              style={S.input}
              placeholder="例：長女、父（別居）"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
            <button type="button" style={S.btn} onClick={addMember}>
              家族を追加
            </button>
          </div>
        </section>

        {/* 2. 支出 */}
        <section style={S.card}>
          <h2 style={S.h2}>2. {YEAR}年の医療支出を記録</h2>
          <div style={S.grid2}>
            <label style={S.label}>
              誰の支出か
              <select style={S.input} value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={S.label}>
              種類
              <select style={S.input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={S.label}>
              金額（円）
              <input
                style={S.input}
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="例：3200"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addEntry()}
              />
            </label>
            <label style={S.label}>
              メモ（任意）
              <input
                style={S.input}
                placeholder="例：○○内科 3月分"
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addEntry()}
              />
            </label>
          </div>
          <p style={S.hint}>{CATEGORY_MAP[form.category].hint}</p>
          {form.category === "otc" && (
            <div style={S.checks}>
              <label style={S.check}>
                <input type="checkbox" checked={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.checked })} />
                治療目的（風邪薬・鎮痛薬・湿布など。ビタミン剤や予防目的は外す）
              </label>
              <label style={S.check}>
                <input type="checkbox" checked={form.selfmedMark} onChange={(e) => setForm({ ...form, selfmedMark: e.target.checked })} />
                セルフメディケーション税制の対象品（パッケージの共通識別マーク、またはレシートの★印）
              </label>
            </div>
          )}
          <button type="button" style={S.btnPrimary} onClick={addEntry}>
            記録する
          </button>

          {entries.length > 0 && (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>誰</th>
                    <th style={S.th}>種類</th>
                    <th style={{ ...S.th, textAlign: "right" }}>金額</th>
                    <th style={S.th}>メモ</th>
                    <th style={S.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td style={S.td}>{memberName(e.memberId)}</td>
                      <td style={S.td}>
                        {CATEGORY_MAP[e.category]?.label}
                        {e.category === "otc" && e.selfmedMark && <span style={S.tag}>セルフメディ対象</span>}
                        {e.category === "otc" && e.treatment === false && <span style={S.tagGray}>控除対象外</span>}
                      </td>
                      <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>{yen(e.amount)}</td>
                      <td style={S.td}>{e.memo}</td>
                      <td style={S.td}>
                        <button type="button" style={S.linkBtn} onClick={() => removeEntry(e.id)}>
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 3. 設定 */}
        <section style={S.card}>
          <h2 style={S.h2}>3. 申告する人の条件</h2>
          <div style={S.grid2}>
            <label style={S.label}>
              保険金・高額療養費などで補填された額（円）
              <input
                style={S.input}
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="0"
                value={settings.reimbursed}
                onChange={(e) => updateSettings({ reimbursed: e.target.value })}
              />
            </label>
            <label style={S.label}>
              総所得金額等（200万円未満のときだけ入力）
              <input
                style={S.input}
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="未入力なら足切り10万円"
                value={settings.totalIncome}
                onChange={(e) => updateSettings({ totalIncome: e.target.value })}
              />
            </label>
            <label style={S.label}>
              所得税率
              <select style={S.input} value={settings.incomeTaxRate} onChange={(e) => updateSettings({ incomeTaxRate: e.target.value })}>
                {INCOME_TAX_RATES.map((r) => (
                  <option key={r.rate} value={String(r.rate)}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...S.check, alignSelf: "end" }}>
              <input
                type="checkbox"
                checked={settings.selfMedQualifies}
                onChange={(e) => updateSettings({ selfMedQualifies: e.target.checked })}
              />
              健康診断・予防接種など「一定の取組」をしている（セルフメディケーション税制の要件）
            </label>
          </div>
        </section>

        {/* 4. 結果 */}
        <section style={{ ...S.card, ...S.resultCard }}>
          <h2 style={S.h2}>4. 世帯の結果（概算）</h2>
          <div style={S.stats}>
            <Stat label="世帯の医療支出" value={yen(summary.total)} />
            <Stat label="医療費通知に載る分" value={yen(summary.inNotice)} sub="マイナポータルで自動取得できる" />
            <Stat label="載らない分" value={yen(summary.notInNotice)} sub="領収書を保管する" strong />
            <Stat label="うち医療費控除に入れられる額" value={yen(summary.deductibleNotInNotice)} sub="通知だけで申告すると漏れる金額" strong />
          </div>

          {members.length > 0 && (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td style={S.td}>{m.name}</td>
                      <td style={{ ...S.td, textAlign: "right" }}>{yen(summary.byMember[m.id])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={S.h3}>どちらの制度が有利か</h3>
          <div style={S.compare}>
            <div style={{ ...S.compareBox, ...(result.better === "medical" ? S.compareWin : {}) }}>
              <div style={S.compareTitle}>医療費控除</div>
              <div style={S.compareRow}>
                <span>対象医療費</span>
                <span>{yen(summary.deductible)}</span>
              </div>
              <div style={S.compareRow}>
                <span>足切り額</span>
                <span>−{yen(result.medical.threshold)}</span>
              </div>
              <div style={S.compareRow}>
                <span>控除額</span>
                <span>{yen(result.medical.amount)}</span>
              </div>
              <div style={{ ...S.compareRow, ...S.compareTotal }}>
                <span>戻る税金の目安</span>
                <span>{yen(result.medicalSaving.total)}</span>
              </div>
            </div>
            <div style={{ ...S.compareBox, ...(result.better === "selfMed" ? S.compareWin : {}) }}>
              <div style={S.compareTitle}>セルフメディケーション税制</div>
              <div style={S.compareRow}>
                <span>対象医薬品の購入額</span>
                <span>{yen(summary.selfMed)}</span>
              </div>
              <div style={S.compareRow}>
                <span>足切り額</span>
                <span>−12,000円</span>
              </div>
              <div style={S.compareRow}>
                <span>控除額（上限88,000円）</span>
                <span>{yen(result.selfMed.amount)}</span>
              </div>
              <div style={{ ...S.compareRow, ...S.compareTotal }}>
                <span>戻る税金の目安</span>
                <span>{yen(result.selfMedSaving.total)}</span>
              </div>
              {result.selfMed.reason && <p style={S.hint}>{result.selfMed.reason}</p>}
            </div>
          </div>
          <p style={S.verdict}>
            {betterLabel
              ? `この世帯は【${betterLabel}】で申告する方が有利です（両制度は選択制で併用できません）。`
              : "現時点では、どちらの制度でも控除額は0円です。載らない分の入力漏れがないか確認してください。"}
          </p>
          <p style={S.hint}>
            戻る税金は、控除額×所得税率（復興特別所得税を含む）＋控除額×住民税率10%の概算です。実際の還付額は他の控除や源泉徴収額で変わります。申告は国税庁の確定申告書等作成コーナーか税理士へ。
          </p>
        </section>

        {/* 5. 特別の料金 */}
        <section style={S.card}>
          <h2 style={S.h2}>先発品の「特別の料金」を計算する</h2>
          <p style={S.hint}>
            ジェネリックがある先発品を希望すると、薬価差の一部を「特別の料金」として別に支払います（2024年10月開始、2026年6月から差額の2分の1）。この金額は医療費控除の対象ですが、医療費通知には載りません。薬価は薬局の明細書か、厚労省の薬価基準で確認できます。
          </p>
          <div style={S.grid2}>
            <label style={S.label}>
              先発品の薬価（1錠・1包あたり、円）
              <input style={S.input} type="number" inputMode="decimal" min="0" value={fee.brandPrice} onChange={(e) => setFee({ ...fee, brandPrice: e.target.value })} />
            </label>
            <label style={S.label}>
              後発品の薬価（同じ単位、円）
              <input style={S.input} type="number" inputMode="decimal" min="0" value={fee.genericPrice} onChange={(e) => setFee({ ...fee, genericPrice: e.target.value })} />
            </label>
            <label style={S.label}>
              数量（錠・包）
              <input style={S.input} type="number" inputMode="numeric" min="0" value={fee.quantity} onChange={(e) => setFee({ ...fee, quantity: e.target.value })} />
            </label>
            <label style={S.label}>
              調剤の時期
              <select style={S.input} value={fee.ratio} onChange={(e) => setFee({ ...fee, ratio: e.target.value })}>
                <option value="0.5">2026年6月以降（差額の2分の1）</option>
                <option value="0.25">2024年10月〜2026年5月（差額の4分の1）</option>
              </select>
            </label>
          </div>
          <div style={S.feeResult}>
            特別の料金の目安：<strong style={S.feeValue}>{yen(feeResult.fee)}</strong>
            <span style={S.hintInline}>（消費税込み。実際は点数換算と端数処理で数円ずれます）</span>
          </div>
          {feeResult.fee > 0 && (
            <button
              type="button"
              style={S.btn}
              onClick={() => {
                setForm((f) => ({ ...f, category: "special_brand", amount: String(feeResult.fee), memo: "先発品の特別の料金" }));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              この金額を記録フォームに入れる
            </button>
          )}
        </section>

        <section style={{ ...S.card, background: "var(--color-background-info)", borderColor: "var(--color-border-info)" }}>
          <h2 style={S.h2}>その薬、処方でもらうのと市販薬で買うのとどちらが安いか</h2>
          <p style={S.hint}>
            単発の症状なら、再診料や調剤料を含めると市販薬の方が安いことがあります。薬価と市販薬の価格から、受診の時間まで含めて比べる計算機を用意しました。
          </p>
          <Link href="/rx-or-otc" style={S.btn}>
            処方か市販薬か、自己負担で比べる →
          </Link>
        </section>

        <section style={S.noteBox}>
          <p style={S.note}>
            このページは薬剤師が設計した家計向けの計算機で、税務・医療の判断を代替するものではありません。制度の数値は2026年9月時点の公開情報に基づく概算です。入力内容はお使いのブラウザにのみ保存され、当サイトのサーバーには送信されません。
          </p>
          <button type="button" style={S.linkBtn} onClick={clearAll}>
            このブラウザの入力をすべて消す
          </button>
        </section>

        <footer style={S.footer}>
          <a href="/tokushoho" style={S.footLink}>特定商取引法に基づく表記</a>・
          <a href="/terms" style={S.footLink}>利用規約</a>・
          <a href="/privacy" style={S.footLink}>プライバシーポリシー</a>
          <div style={{ marginTop: 8 }}>© 2026 Pharma-Ad Lab</div>
        </footer>
      </div>
    </>
  );
}

function Stat({ label, value, sub, strong }) {
  return (
    <div style={{ ...S.stat, ...(strong ? S.statStrong : {}) }}>
      <div style={S.statLabel}>{label}</div>
      <div style={S.statValue}>{value}</div>
      {sub && <div style={S.statSub}>{sub}</div>}
    </div>
  );
}

const S = {
  container: { maxWidth: 800, margin: "0 auto", padding: "24px 16px 40px" },
  backLink: { fontSize: 13, color: "var(--color-text-secondary)", textDecoration: "none", display: "inline-block", marginBottom: 18 },
  eyebrow: { fontSize: 12, color: "var(--color-text-info)", fontWeight: 600, margin: "0 0 6px", letterSpacing: 0.5 },
  h1: { fontSize: 24, fontWeight: 700, margin: "0 0 10px", lineHeight: 1.3 },
  h2: { fontSize: 16, fontWeight: 600, margin: "0 0 10px" },
  h3: { fontSize: 14, fontWeight: 600, margin: "20px 0 10px" },
  lead: { fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 24px", lineHeight: 1.9 },
  card: {
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-lg)",
    padding: "18px 18px 16px",
    marginBottom: 16,
  },
  resultCard: { borderColor: "var(--color-border-info)" },
  hint: { fontSize: 12, color: "var(--color-text-secondary)", margin: "6px 0 12px", lineHeight: 1.8 },
  hintInline: { fontSize: 12, color: "var(--color-text-secondary)", marginLeft: 8 },
  row: { display: "flex", gap: 8, flexWrap: "wrap" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 },
  input: {
    fontSize: 14,
    padding: "8px 10px",
    border: "0.5px solid var(--color-border-secondary)",
    borderRadius: "var(--border-radius-md)",
    background: "var(--color-background-primary)",
    color: "var(--color-text-primary)",
    fontFamily: "var(--font-sans)",
    minWidth: 0,
    flex: 1,
  },
  checks: { display: "flex", flexDirection: "column", gap: 6, margin: "0 0 12px" },
  check: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.6 },
  btn: { fontSize: 13, padding: "8px 16px", borderRadius: "var(--border-radius-md)", fontWeight: 500, display: "inline-block", textDecoration: "none", background: "var(--color-background-primary)", color: "var(--color-text-info)", border: "0.5px solid var(--color-border-info)" },
  btnPrimary: {
    fontSize: 14,
    padding: "10px 22px",
    borderRadius: "var(--border-radius-md)",
    fontWeight: 600,
    background: "var(--color-text-info)",
    color: "#fff",
    border: "0.5px solid var(--color-text-info)",
    marginTop: 4,
  },
  linkBtn: { background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: 12, padding: "4px 6px", textDecoration: "underline" },
  chips: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    padding: "4px 6px 4px 12px",
    borderRadius: 999,
    background: "var(--color-background-info)",
    border: "0.5px solid var(--color-border-info)",
    color: "var(--color-text-info)",
  },
  chipX: { background: "none", border: "none", color: "var(--color-text-info)", fontSize: 14, padding: "0 6px", lineHeight: 1 },
  tableWrap: { overflowX: "auto", marginTop: 14 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)", padding: "6px 8px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12 },
  td: { padding: "8px 8px", borderBottom: "0.5px solid var(--color-border-tertiary)", verticalAlign: "top" },
  tag: { marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--color-background-success)", color: "var(--color-text-success)", border: "0.5px solid var(--color-border-success)" },
  tagGray: { marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 6 },
  stat: { padding: "12px 14px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)" },
  statStrong: { background: "var(--color-background-info)", borderColor: "var(--color-border-info)" },
  statLabel: { fontSize: 12, color: "var(--color-text-secondary)" },
  statValue: { fontSize: 20, fontWeight: 700, margin: "2px 0" },
  statSub: { fontSize: 11, color: "var(--color-text-secondary)" },
  compare: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 },
  compareBox: { padding: "14px 16px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" },
  compareWin: { borderColor: "var(--color-border-success)", background: "var(--color-background-success)" },
  compareTitle: { fontSize: 14, fontWeight: 600, marginBottom: 8 },
  compareRow: { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0", color: "var(--color-text-secondary)" },
  compareTotal: { color: "var(--color-text-primary)", fontWeight: 700, borderTop: "0.5px solid var(--color-border-secondary)", marginTop: 6, paddingTop: 8 },
  verdict: { fontSize: 14, fontWeight: 600, margin: "16px 0 6px", lineHeight: 1.8 },
  feeResult: { fontSize: 14, margin: "12px 0" },
  feeValue: { fontSize: 20, marginLeft: 6 },
  noteBox: { padding: "4px 4px 0" },
  note: { fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, margin: "0 0 8px" },
  footer: { textAlign: "center", padding: "28px 16px 0", fontSize: 12, color: "var(--color-text-secondary)", borderTop: "0.5px solid var(--color-border-tertiary)", marginTop: 24 },
  footLink: { color: "var(--color-text-secondary)", margin: "0 6px" },
};
