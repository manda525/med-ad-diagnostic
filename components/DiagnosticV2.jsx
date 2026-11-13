import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { INDUSTRIES, MEDIA } from "../lib/taxonomy";
import stats from "../data/stats.json";
import { superviseFeeFor, buildSubject, buildMetaLines, buildApplyText, buildMailto } from "../lib/supervise";
import { inferContext } from "../lib/infer";
import { RADAR_CSS } from "./radarTheme";

// ===== 定数 =====
// 無料枠は1日5回（サーバー側 lib/usage.js と揃える）。3回目以降はLINE案内を出す。
const FREE_LIMIT = 3;
const HARD_LIMIT = 5;
const LINE_URL = "https://lin.ee/7GlM6CT";
const CONTACT_EMAIL = "masa@med-ad-masa.com";

// 有料プラン（Stripe）の決済コードは残すが、2026-09-24 から画面には出さない。
// 課金は機械の一次チェックでなく人の監修で行う。
// eslint-disable-next-line no-unused-vars
const PLANS = [
  { key: "individual", label: "個人プラン", price: "¥500", unit: "/月", note: "個人・小規模の方向け" },
  { key: "corporate", label: "法人プラン", price: "¥5,000", unit: "/月", note: "チーム・代理店向け" },
];

const SAMPLES = [
  { label: "健康食品", industry: "E", sub: "supp", media: "lp",
    text: "脳のゴミを減らすサプリ。毎日飲むだけで記憶力が向上し、アンチエイジング効果も期待できます。疲労回復にも最適で、泥のように眠れると大好評！脂肪燃焼もサポートします。" },
  { label: "化粧品", industry: "E", sub: "cosme", media: "lp",
    text: "このコラーゲン美容液でシミが消える！たるんだ肌へ直接アプローチ。細胞を活性化させ若返りをサポート。テーピング効果でリフトアップ！アンチエイジングの新常識。" },
  { label: "クリニック", industry: "A", sub: "biyou", media: "hp",
    text: "当院のオリジナル施術で、シワが消える・たるみを取る・発毛効果が期待できます。医師推薦！満足度93%。アトピーや花粉症でお悩みの方にも対応しています。" },
  { label: "整体院", industry: "C", sub: "seitai", media: "sns",
    text: "腰痛・肩こりを根本から治療する整体院。骨盤矯正で産後の不調も完治！医学的アプローチで効果を保証します。" },
  { label: "ペットフード", industry: "G", sub: "petfood", media: "package",
    text: "完全無添加の国産ドッグフード。関節炎を予防し、皮膚病も改善。獣医師も推奨する奇跡のフードです。" },
];

const JUDGMENT_STYLE = {
  "修正必須": { c: "#A3261A", bg: "#F7E6DF", bd: "#D9A394" },
  "要修正":   { c: "#7D5200", bg: "#F6ECD0", bd: "#D6B96A" },
  "軽微修正": { c: "#1F4F8F", bg: "#E3EAF1", bd: "#9DB4CF" },
  "問題なし": { c: "#0F5B4E", bg: "#E3EFE8", bd: "#9CC5B6" },
};
const LEVEL_STYLE = {
  HIGH:   { c: "#A3261A", bg: "#F7E6DF" },
  MEDIUM: { c: "#7D5200", bg: "#F6ECD0" },
  LOW:    { c: "#1F4F8F", bg: "#E3EAF1" },
};

// ===== 原文ハイライト =====
function highlightText(text, riskItems) {
  if (!riskItems?.length) return [{ t: text }];
  const spans = [];
  const lowered = text;
  const marks = [];
  for (const item of riskItems) {
    const expr = (item.expression || "").trim();
    if (expr.length < 2) continue;
    let idx = lowered.indexOf(expr);
    if (idx === -1 && expr.length > 8) idx = lowered.indexOf(expr.slice(0, 8));
    if (idx >= 0) marks.push({ start: idx, end: idx + Math.min(expr.length, text.length - idx), level: item.level });
  }
  marks.sort((a, b) => a.start - b.start);
  let pos = 0;
  for (const m of marks) {
    if (m.start < pos) continue;
    if (m.start > pos) spans.push({ t: text.slice(pos, m.start) });
    spans.push({ t: text.slice(m.start, m.end), level: m.level });
    pos = m.end;
  }
  if (pos < text.length) spans.push({ t: text.slice(pos) });
  return spans;
}

// ===== メイン =====
export default function DiagnosticV2() {
  // ウィザード状態
  const [industry, setIndustry] = useState(null);   // カテゴリID
  const [sub, setSub] = useState(null);
  const [clientIndustry, setClientIndustry] = useState(null); // F選択時の受託先
  const [clientSub, setClientSub] = useState(null);
  const [media, setMedia] = useState(null);
  const [text, setText] = useState("");
  // 入口を1画面にするための状態。業種・媒体は広告文から推定し、
  // ユーザーには「確認」だけさせる。手で触った時点で推定を止める。
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualPick, setManualPick] = useState(false);

  // 実行状態
  const [loading, setLoading] = useState(false);
  const [stepMsg, setStepMsg] = useState("");
  const [res, setRes] = useState(null); // {analysis, matches, matchCount, laws, engine}
  const [err, setErr] = useState("");
  const [showContact, setShowContact] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [copyState, setCopyState] = useState(null); // null | "ok" | "fail"
  const [showApplyText, setShowApplyText] = useState(false);
  const resultRef = useRef(null);

  // 課金・利用回数
  const [usageCount, setUsageCount] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState("");

  // 利用回数の正本はサーバー側。ここで取るのは表示用（実際の可否は診断APIが判定する）。
  const refreshUsage = useCallback(async () => {
    if (typeof window === "undefined") return;
    const entToken = window.localStorage.getItem("med_ad_token") || "";
    try {
      const r = await fetch("/api/usage", {
        headers: entToken ? { "x-entitlement-token": entToken } : {},
      });
      if (!r.ok) return;
      const data = await r.json();
      if (typeof data.used === "number") setUsageCount(data.used);
      setIsPro(!!data.pro);
    } catch {
      /* 表示用なので失敗しても診断はできる */
    }
  }, []);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  // Stripe Checkout からの復帰
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (!status) return;
    const sessionId = params.get("session_id");
    params.delete("checkout"); params.delete("session_id");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    if (status !== "success" || !sessionId) return;
    (async () => {
      try {
        const r = await fetch("/api/verify-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.pro && data.token) {
          window.localStorage.setItem("med_ad_pro", "1");
          window.localStorage.setItem("med_ad_token", data.token);
          setIsPro(true);
          // 起動時の refreshUsage がトークン取得前に走っていた場合の取り違えを防ぐため、取り直す
          refreshUsage();
        } else {
          setErr("決済の確認ができませんでした。反映されない場合はお問い合わせください。");
        }
      } catch { setErr("決済の確認中にエラーが発生しました。"); }
    })();
  }, [refreshUsage]);

  const startCheckout = useCallback(async (plan) => {
    setErr(""); setCheckoutLoading(plan);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.url && typeof window !== "undefined") { window.location.href = data.url; return; }
      throw new Error(data.error || "決済ページの作成に失敗しました");
    } catch (e) { setErr(e.message || "決済の開始に失敗しました"); setCheckoutLoading(""); }
  }, []);

  // 顧客IDは送らない。サーバーが署名付きトークンから取り出す。
  const openPortal = useCallback(async () => {
    if (typeof window === "undefined") return;
    const entToken = window.localStorage.getItem("med_ad_token") || "";
    if (!entToken) { setErr("ご契約の確認ができませんでした。"); return; }
    try {
      const r = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-entitlement-token": entToken },
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.url) { window.location.href = data.url; return; }
      throw new Error(data.error || "管理ページを開けませんでした");
    } catch (e) { setErr(e.message || "管理ページを開けませんでした"); }
  }, []);

  const isOverFreeLimit = usageCount >= FREE_LIMIT && !isPro;
  const isOverHardLimit = usageCount >= HARD_LIMIT && !isPro;

  const selectedIndustry = INDUSTRIES.find((i) => i.id === industry);
  const needsClient = industry === "F";
  const clientIndustryObj = INDUSTRIES.find((i) => i.id === clientIndustry);

  // 広告文が変わるたびに業種・媒体を推定する。手動で選んだ後は上書きしない。
  useEffect(() => {
    if (manualPick) return;
    const g = inferContext(text);
    if (!g.industry) return;
    setIndustry(g.industry);
    setSub(g.sub);
    setMedia(g.media);
    setClientIndustry(null);
    setClientSub(null);
  }, [text, manualPick]);

  const step1Done = !!industry && (!needsClient || !!clientIndustry);
  const step2Done = step1Done && !!media;
  const canRun = step2Done && text.trim().length > 0 && !loading && !isOverHardLimit;

  const pickSample = useCallback((s) => {
    setManualPick(true);
    setIndustry(s.industry); setSub(s.sub); setMedia(s.media); setText(s.text);
    setClientIndustry(null); setClientSub(null);
  }, []);

  const run = useCallback(async () => {
    if (!canRun) return;
    setLoading(true); setRes(null); setErr("");
    setStepMsg(`法令DB ${stats.law_count}件・ルール${stats.rule_version}（${stats.rule_count}件）から適用範囲を特定中...`);
    try {
      const entToken = typeof window !== "undefined" ? (window.localStorage.getItem("med_ad_token") || "") : "";
      setStepMsg("AI診断中...（業種×媒体の法令コンテキストで判定しています）");
      const r = await fetch("/api/diagnose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(entToken ? { "x-entitlement-token": entToken } : {}),
        },
        body: JSON.stringify({ text, industry, sub, media, clientIndustry, clientSub }),
      });
      const data = await r.json().catch(() => ({}));
      // 回数はサーバーが数えている。返ってきた値をそのまま表示に反映する。
      if (data.usage && typeof data.usage.used === "number") {
        setUsageCount(data.usage.used);
        setIsPro(!!data.usage.pro);
      }
      if (r.status === 402) { setErr(data.error || "無料診断の上限に達しました。"); return; }
      if (r.status === 429) { setErr(data.error || "リクエストが集中しています。しばらく置いてからお試しください。"); return; }
      if (!r.ok) throw new Error(data.error || `API応答エラー (${r.status})`);
      setRes(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (e) {
      setErr(e.message || "診断に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false); setStepMsg("");
    }
  }, [canRun, text, industry, sub, media, clientIndustry, clientSub]);

  const a = res?.analysis;
  const jStyle = a ? (JUDGMENT_STYLE[a.final_judgment] || JUDGMENT_STYLE["要修正"]) : null;
  const highlighted = useMemo(() => (a ? highlightText(text, a.risk_items) : null), [a, text]);

  // 有料監修の確定料金と申込内容。組み立ては lib/supervise.js に集約している。
  // 申込は「クリップボードにコピー → メーラーで貼り付け」の2段構え。原稿を mailto の
  // URL に載せると、日本語のエンコードで長さが原稿量に比例して伸び、Windows/Outlook の
  // 上限（約2,000字）を超えてメーラーが起動しなくなるため（tests/supervise.test.mjs）。
  const superviseFee = superviseFeeFor(text.length);

  const superviseMeta = useMemo(() => {
    if (!a) return null;
    const ind = INDUSTRIES.find((i) => i.id === industry);
    const common = {
      industryLabel: ind?.label || industry,
      subLabel: ind?.subs?.find((x) => x.id === sub)?.label || "",
      mediaLabel: MEDIA.find((m) => m.id === media)?.label || media || "",
      judgment: a.final_judgment,
      riskScore: a.risk_score,
      length: text.length,
      fee: superviseFee,
    };
    return { subject: buildSubject(common), lines: buildMetaLines(common) };
  }, [a, industry, sub, media, text.length, superviseFee]);

  const superviseApplyText = useMemo(
    () => (superviseMeta ? buildApplyText({ metaLines: superviseMeta.lines, text }) : ""),
    [superviseMeta, text]
  );

  const superviseMailto = useMemo(
    () => (superviseMeta ? buildMailto({ email: CONTACT_EMAIL, subject: superviseMeta.subject }) : ""),
    [superviseMeta]
  );

  // クリップボードAPIが使えない環境（http・古いSafari・権限拒否）向けの退避。
  const legacyCopy = useCallback((value) => {
    try {
      const el = document.createElement("textarea");
      el.value = value;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch (_) {
      return false;
    }
  }, []);

  // コピーに成功したときだけメーラーを開く。失敗したら開かずに本文を画面に出す。
  const handleSuperviseApply = useCallback(
    async (e) => {
      e.preventDefault();
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(superviseApplyText);
          ok = true;
        }
      } catch (_) {
        ok = false;
      }
      if (!ok) ok = legacyCopy(superviseApplyText);
      setCopyState(ok ? "ok" : "fail");
      if (ok) {
        window.location.href = superviseMailto;
      } else {
        setShowApplyText(true);
      }
    },
    [superviseApplyText, superviseMailto, legacyCopy]
  );

  const remaining = Math.max(0, HARD_LIMIT - usageCount);
  const consultMailto = `mailto:${CONTACT_EMAIL}?subject=広告診断・監修相談&body=【ご相談内容】%0A%0A【業種・商材】%0A%0A【広告媒体】%0A%0A【ご予算】`;

  return (
    <div className="v2 rd">
      {/* SSRで引用符が &quot; / &#x27; にエスケープされ、クライアントと文字列が一致せず
          ハイドレーションが失敗する（Next 14で再現）。__html で渡すとエスケープされない。 */}
      <style dangerouslySetInnerHTML={{ __html: RADAR_CSS }} />

      {/* ===== ナビ ===== */}
      <header className="nav">
        <div className="wrap">
          <div className="brand">
            <a className="logo" href="https://med-ad-masa.com" target="_blank" rel="noopener noreferrer" aria-label="Pharma-Ad Lab">
              <LogoMark />
              <span>Pharma<span className="ad">-Ad</span><span className="lab">Lab</span></span>
            </a>
            <a className="tool" href="/">薬機レーダー</a>
          </div>
          <nav className="navlinks" aria-label="主なメニュー">
            <a className="navlink" href="/consult">監修サービスのご案内</a>
            <a className="navlink" href="/household">世帯の医療費計算機（無料）</a>
            <button type="button" className="btn btn-fill btn-sm" aria-expanded={showContact} aria-controls="v2-contact"
              onClick={() => setShowContact(!showContact)}>
              監修相談
            </button>
          </nav>
        </div>
      </header>

      <div className="wrap top">
        <div className="mast mono">
          <span>Pharma-Ad Lab</span>
          <span>薬機法・景表法・医療広告GL</span>
          <span>ルール {stats.rule_version}</span>
        </div>

        <div className="first">
          {/* ===== 見出し ===== */}
          <div className="intro">
            <div className="head">
              <p className="kicker mono">PHARMA-AD LAB</p>
              <h1>薬機レーダー<span className="sig">。</span></h1>
              <p className="tag">薬機法<i>・</i>景表法<i>・</i>医療広告GL　AIチェック</p>
              <p className="lead">
                広告文を貼るだけ。<span className="nb">薬機法・景表法・医療広告GLなどに照らして、</span>
                <span className="nb">条文根拠つきで</span><span className="nb">リスク箇所と修正案を返します。</span>
              </p>
            </div>
            <dl className="facts">
              <div>
                <dt>無料</dt>
                <dd>{isPro ? "✓ Pro（無制限）" : <>本日あと<span className="num">{remaining}/{HARD_LIMIT}</span>回</>}</dd>
              </div>
              <div><dt>法令DB</dt><dd><span className="num">{stats.law_count}</span>件</dd></div>
              <div><dt>ルール</dt><dd><span className="num">{stats.rule_version}</span>（<span className="num">{stats.rule_count}</span>件）</dd></div>
            </dl>
          </div>

          <div className="col">
            {/* ===== 監修相談 ===== */}
            {showContact && (
              <div className="blk tint acc" id="v2-contact">
                <p className="blk-h">広告監修・コンサルティングのご相談</p>
                <p className="blk-p">
                  LP全文精査・薬機法対応・継続監修契約など、薬剤師×医療広告コンプライアンス専門家として対応します。
                </p>
                <p className="blk-p"><a className="more" href="/consult">監修サービスの詳細を見る <Arw /></a></p>
                <div className="acts">
                  <a className="btn btn-rule btn-sm" href={consultMailto}>メールで相談</a>
                  <a className="btn btn-rule btn-sm" href="https://x.com/Pharma_Ad_Lab" target="_blank" rel="noopener noreferrer">X DMで相談</a>
                  <a className="btn btn-rule btn-sm" href="https://note.com/med_ad_consult" target="_blank" rel="noopener noreferrer">note</a>
                </div>
              </div>
            )}

            {/* ===== 上限到達 ===== */}
            {isOverHardLimit && (
              <div className="blk tint warn">
                <p className="blk-h">本日の無料診断（5回）を使い切りました。24時間後にまた使えます</p>
                <p className="blk-p">
                  入稿が近い原稿は、薬剤師・薬機法管理者が人の目で確定させます。3円/文字（最低1万円）、1営業日以内に返信します。
                </p>
                <div className="acts">
                  <a className="btn btn-fill btn-sm" href={`mailto:${CONTACT_EMAIL}?subject=広告監修の申込&body=【原稿】%0A%0A【業種・商材】%0A%0A【広告媒体】%0A%0A【入稿予定日】`}>
                    薬剤師の監修に出す
                  </a>
                  <a className="more" href="/consult">監修サービスの詳細 <Arw /></a>
                </div>
              </div>
            )}

            {/* ===== 記入欄（入力・判定条件・実行） ===== */}
            <div className="form">
              <div className="form-head">
                <span className="mono">記入欄</span>
                <span className="quota">
                  {isPro ? "✓ Pro（無制限）" : <>無料・本日あと <span className="num">{remaining}/{HARD_LIMIT}</span>回</>}
                  {isPro && <button type="button" className="link-btn" onClick={openPortal}>支払い・解約</button>}
                </span>
              </div>
              <div className="form-body">
                <label className="ttl" htmlFor="v2-text">広告文を貼り付ける</label>
                <p className="sub" id="v2-text-sub">LP文言・SNS投稿・パッケージ文言などをそのまま貼り付けてください（8,000文字まで）。業種と媒体は本文から自動で判定します。</p>
                <textarea id="v2-text" className="sheet" aria-describedby="v2-text-sub" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
                  placeholder={"例：飲むだけでみるみる痩せる！医師も推奨するサプリで、糖尿病の予防にも。"} />
                <div className="under">
                  <div className="samples">
                    <span className="lbl">サンプル:</span>
                    {SAMPLES.map((s, i) => (
                      <button key={i} type="button" className={`chip ${text === s.text ? "on" : ""}`} onClick={() => pickSample(s)}>{s.label}</button>
                    ))}
                  </div>
                  <span className="count"><span className="num">{text.length.toLocaleString()}</span>文字</span>
                </div>

                {/* 判定条件の確認（推定結果） */}
                {!!text.trim() && (
                  <div className="cond">
                    <span className="k">{manualPick ? "この条件で判定します：" : "本文から判定しました："}</span>
                    <div className="cond-row">
                      <span className="v">
                        {selectedIndustry?.label || "―"}
                        {sub ? `・${selectedIndustry?.subs.find((x) => x.id === sub)?.label || ""}` : ""}
                        {" ／ "}
                        {MEDIA.find((m) => m.id === media)?.label || "―"}
                      </span>
                      <button type="button" className="link-btn" aria-expanded={pickerOpen} onClick={() => setPickerOpen((v) => !v)}>
                        {pickerOpen ? "閉じる" : "変更する"}
                      </button>
                    </div>
                    {!manualPick && (
                      <p className="note">業種で適用される法令が変わります。違っていれば「変更する」で選び直してください。</p>
                    )}
                  </div>
                )}
              </div>

              {/* 実行 */}
              <div className="run">
                <button type="button" className="btn btn-fill btn-run" disabled={!canRun} onClick={run}>
                  {loading ? "診断中..." : isOverHardLimit ? "利用上限に到達" : <>リスク診断を実行 <Arw /></>}
                </button>
                {!text.trim() && <p className="hint">広告文を貼り付けてください</p>}
                {!!text.trim() && needsClient && !clientIndustry && <p className="hint warn">受託先（広告主）の業種を選んでください</p>}
              </div>
            </div>

            {/* ===== 業種・媒体の手動選択（既定は閉じる） ===== */}
            {(pickerOpen || (needsClient && !clientIndustry)) && (
            <>
            {/* ===== STEP 1 業種 ===== */}
            <div className="blk">
              <div className="step-head">
                <span className={`step-num ${step1Done ? "done" : ""}`}>01</span>
                <span className="blk-h">クライアントの業種</span>
                {step1Done && <span className="picked">✓ {selectedIndustry?.label}{sub ? `・${selectedIndustry?.subs.find((s) => s.id === sub)?.label}` : ""}</span>}
              </div>
              <p className="step-sub">業種で適用される法令が変わります（例：整骨院は柔整法、ペットフードは景表法＋公正競争規約）</p>
              <div className="grid ind">
                {INDUSTRIES.map((ind) => (
                  <button key={ind.id} type="button" className={`tile ${industry === ind.id ? "on" : ""}`} aria-pressed={industry === ind.id}
                    onClick={() => { setManualPick(true); setIndustry(ind.id); setSub(null); if (ind.id !== "F") { setClientIndustry(null); setClientSub(null); } }}>
                    <div className="t1">{ind.label}</div>
                    <div className="t2">{ind.desc}</div>
                  </button>
                ))}
              </div>
              {selectedIndustry && (
                <div className="subs">
                  <p className="step-note">詳細（任意・選ぶと精度が上がります）</p>
                  <div className="chips">
                    {selectedIndustry.subs.map((s) => (
                      <button key={s.id} type="button" className={`chip ${sub === s.id ? "on" : ""}`} aria-pressed={sub === s.id} onClick={() => { setManualPick(true); setSub(sub === s.id ? null : s.id); }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {needsClient && (
                <div className="client">
                  <p className="client-h">受託先（広告主）の業種 <span className="req">必須</span></p>
                  <p className="step-note">制作物は受託先業種の規制を継承します。加えてステマ規制・表示主体責任をチェックします。</p>
                  <div className="chips">
                    {INDUSTRIES.filter((i) => i.id !== "F").map((i) => (
                      <button key={i.id} type="button" className={`chip ${clientIndustry === i.id ? "on" : ""}`} aria-pressed={clientIndustry === i.id}
                        onClick={() => { setManualPick(true); setClientIndustry(i.id); setClientSub(null); }}>
                        {i.label}
                      </button>
                    ))}
                  </div>
                  {clientIndustryObj && (
                    <div className="chips" style={{ marginTop: 8 }}>
                      {clientIndustryObj.subs.map((s) => (
                        <button key={s.id} type="button" className={`chip ${clientSub === s.id ? "on" : ""}`} aria-pressed={clientSub === s.id} onClick={() => { setManualPick(true); setClientSub(clientSub === s.id ? null : s.id); }}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ===== STEP 2 媒体 ===== */}
            <div className="blk">
              <div className="step-head">
                <span className={`step-num ${step2Done ? "done" : step1Done ? "" : "off"}`}>02</span>
                <span className="blk-h">広告を出す媒体</span>
                {media && <span className="picked">✓ {MEDIA.find((m) => m.id === media)?.label}</span>}
              </div>
              <p className="step-sub">媒体で「広告該当性」や要件が変わります（例：SNSはステマ規制、医療HPは限定解除）</p>
              <div className="grid med">
                {MEDIA.map((m) => (
                  <button key={m.id} type="button" className={`tile ${media === m.id ? "on" : ""}`} aria-pressed={media === m.id} onClick={() => { setManualPick(true); setMedia(m.id); }}>
                    <div className="t1">{m.label}</div>
                  </button>
                ))}
              </div>
              {media && <p className="med-note">◎ {MEDIA.find((m) => m.id === media)?.note}</p>}
            </div>

            </>
            )}
            {loading && (
              <div className="blk loading" role="status">
                <span className="bar" aria-hidden="true" />
                <span className="msg">{stepMsg}</span>
              </div>
            )}

            {err && (
              <div className="blk tint danger" role="alert">
                <p className="blk-p strong">{err}</p>
                {!isOverHardLimit && <button className="btn btn-rule btn-sm" type="button" onClick={run}>もう一度試す</button>}
              </div>
            )}

            {/* ===== 結果 ===== */}
            {a && (
              <div ref={resultRef} className="res">
                {/* 判定ヘッダー */}
                <div className="blk tint verdict" style={{ borderColor: jStyle.bd, background: jStyle.bg }}>
                  <div className="verdict-row">
                    <div>
                      <p className="mono" style={{ color: jStyle.c }}>最終判定</p>
                      <p className="verdict-j" style={{ color: jStyle.c }}>{a.final_judgment}</p>
                    </div>
                    <div className="scores">
                      <div>
                        <p className="n" style={{ color: jStyle.c }}>{a.risk_score}</p>
                        <p className="l">リスクスコア</p>
                      </div>
                      <div>
                        <p className="n" style={{ color: "var(--ok)" }}>{a.sayable?.length || 0}</p>
                        <p className="l">言える切り口</p>
                      </div>
                      <div>
                        <p className="n">{a.risk_items?.length || 0}</p>
                        <p className="l">直す点</p>
                      </div>
                    </div>
                  </div>
                  <p className="verdict-sum">{a.summary}</p>
                </div>

                {/* 原文ハイライト */}
                {highlighted && (
                  <div className="blk">
                    <p className="blk-h">原文チェック <span className="blk-aside">色付き＝指摘箇所</span></p>
                    <p className="orig">
                      {highlighted.map((s, i) => s.level
                        ? <mark key={i} className={s.level}>{s.t}</mark>
                        : <span key={i}>{s.t}</span>)}
                    </p>
                  </div>
                )}

                {/* 媒体注意 */}
                {a.media_notes && (
                  <div className="blk tint acc">
                    <p className="blk-k">この媒体での注意（{MEDIA.find((m) => m.id === media)?.label}）</p>
                    <p className="blk-p ink">{a.media_notes}</p>
                  </div>
                )}

                {/* 言える範囲（指摘より先に出す） */}
                {a.sayable?.length > 0 && (
                  <div className="blk tint ok">
                    <p className="blk-h">この商材で言えること（{a.sayable.length}件）</p>
                    <p className="blk-sub">訴求を落とさずに使える切り口です。ここから組み立ててください</p>
                    {a.sayable.map((s, i) => (
                      <div key={i} className="item">
                        <p className="item-k">{s.angle}</p>
                        <p className="item-v">「{s.example}」</p>
                        {s.caveat && <p className="item-n">条件：{s.caveat}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* 直す点 */}
                {a.risk_items?.length > 0 && (
                  <div className="blk">
                    <p className="blk-h">直す点（{a.risk_items.length}件）</p>
                    <p className="blk-sub">それぞれに代替案を付けています</p>
                    {a.risk_items.map((item, i) => {
                      const ls = LEVEL_STYLE[item.level] || LEVEL_STYLE.MEDIUM;
                      return (
                        <div key={i} className="item">
                          <div className="risk-head">
                            <span className="lv" style={{ background: ls.bg, color: ls.c, borderColor: ls.c }}>{item.level}</span>
                            <span className="risk-expr">「{item.expression}」</span>
                          </div>
                          <p className="risk-reason">{item.reason}</p>
                          {item.alternative && (
                            <div className="cell ok">
                              <p className="cell-k">こう直せば出せる</p>
                              <p className="cell-v">{item.alternative}</p>
                            </div>
                          )}
                          <span className="law">
                            {item.law}{item.law_id ? `（${item.law_id}）` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 修正提案 */}
                {a.suggestions?.length > 0 && (
                  <div className="blk">
                    <p className="blk-h">修正提案</p>
                    {a.suggestions.map((s, i) => (
                      <div key={i} className="item">
                        <div className="pair">
                          <div className="cell ng">
                            <p className="cell-k">NG</p>
                            <p className="cell-v">{s.original}</p>
                          </div>
                          <div className="cell ok">
                            <p className="cell-k">修正案</p>
                            <p className="cell-v">{s.revised}</p>
                          </div>
                        </div>
                        {s.point && <p className="item-n">{s.point}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* 法的根拠（一次ソースリンク） */}
                {a.legal_basis?.length > 0 && (
                  <div className="blk">
                    <p className="blk-h">法的根拠</p>
                    <p className="blk-sub">一次ソース（省庁・e-Gov等）で検証済みの法令データベースに基づく判定です</p>
                    {/* 信頼の裏づけは「使う前」でなく「判定の根拠」として出す */}
                    <div className="proof">
                      {[
                        [`${stats.law_count}法令DB`, "一次ソース検証済み"],
                        ["条文根拠つき", "law_idで法令に紐づく判定"],
                        [`ルールブック ${stats.rule_version}`, `${stats.rule_updated} 更新・${stats.rule_count}項目`],
                      ].map(([t, d], i) => (
                        <div key={i}>
                          <b>{t}</b>　{d}
                        </div>
                      ))}
                    </div>
                    {a.legal_basis.map((b, i) => {
                      const node = res.laws?.find((l) => l.id === b.law_id);
                      return (
                        <div key={i} className="item">
                          <p className="item-k">
                            {b.name} <span className="blk-aside">{node?.article || ""}</span>
                          </p>
                          <p className="risk-reason">{b.point}</p>
                          {node?.source_urls?.[0] && (
                            <a className="src" href={node.source_urls[0]} target="_blank" rel="noopener noreferrer">一次ソースを確認 ↗</a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* アドバイス */}
                {a.advice && (
                  <div className="blk tint plain">
                    <p className="blk-k muted">薬剤師・広告コンサルより</p>
                    <p className="advice">{a.advice}</p>
                  </div>
                )}

                {/* ルール照合（折りたたみ） */}
                {res.matches?.length > 0 && (
                  <div className="blk tint plain">
                    <button type="button" className="fold" aria-expanded={showRules} onClick={() => setShowRules(!showRules)}>
                      <span className="fold-i" aria-hidden="true">{showRules ? "−" : "+"}</span> ルールブック照合（{res.matchCount}件マッチ・{res.engine?.rulebook}）
                    </button>
                    {showRules && res.matches.map((m, i) => (
                      <div key={i} className="match" style={{ marginTop: i === 0 ? 12 : 0 }}>
                        <div className="match-head">
                          <span className="match-risk" style={{ color: m.risk >= 90 ? "var(--danger)" : m.risk >= 75 ? "var(--warn)" : "var(--info)" }}>{m.risk}</span>
                          <span className="match-ng">{m.ng.slice(0, 32)}</span>
                          <span className="match-genre">{m.genre}</span>
                          {m.law_ids?.map((l) => <span key={l} className="match-law">{l}</span>)}
                        </div>
                        {m.comment && <p className="match-c">{m.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* LINE誘導 */}
                {isOverFreeLimit && !isOverHardLimit && (
                  <div className="blk tint ok">
                    <p className="blk-h">LINE登録で最新の法規制アップデートを配信中</p>
                    <p className="blk-p">
                      無料診断は本日あと{remaining}回（24時間で復活）。広告監修のご相談もLINEからどうぞ。
                    </p>
                    <a className="btn btn-sm btn-line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
                      LINE公式アカウントを登録
                    </a>
                  </div>
                )}

                {/* 免責＋CTA */}
                <div className="blk tint warn slim">
                  <p className="blk-p">
                    本ツールはAIによる一次診断です。最終的な適否判断は薬剤師×医療広告コンサルタントによる監修、または弁護士にご相談ください。
                  </p>
                </div>
                {/* 有料監修の申込（診断内容から見積を確定して構造化して送る） */}
                <div className="blk apply">
                  <p className="apply-h">この診断を、薬剤師の監修で確定させる</p>
                  <p className="blk-p">
                    AIの一次診断は参考情報です。掲載可否の確定と修正文の納品は、薬剤師・薬機法管理者による監修で行います。
                  </p>
                  <div className="quote">
                    <div>
                      <p className="l">原稿の分量</p>
                      <p className="n">{text.length.toLocaleString()}文字</p>
                    </div>
                    <div>
                      <p className="l">監修料金（3円/文字・税別）</p>
                      <p className="n">¥{superviseFee.toLocaleString()}{superviseFee === 10000 && text.length * 3 < 10000 ? "（最低受託料金）" : ""}</p>
                    </div>
                    <div>
                      <p className="l">ご返信</p>
                      <p className="n">1営業日以内</p>
                    </div>
                  </div>
                  <p className="item-n">
                    上記が確定料金です（原稿の追加・リライト込みをご希望の場合は別途お見積り）。納品日はご返信時に確定します。
                  </p>
                  <div className="acts">
                    <a className="btn btn-fill btn-sm" href={superviseMailto} onClick={handleSuperviseApply}>
                      申込内容をコピーしてメールを開く
                    </a>
                    <a className="btn btn-rule btn-sm" href={consultMailto}>
                      まずは無料で相談する
                    </a>
                  </div>

                  {copyState === "ok" && (
                    <p className="copy ok">
                      ✓ 申込内容（原稿の全文つき）をコピーしました。開いたメールの本文に貼り付けて送信してください。
                    </p>
                  )}
                  {copyState === "fail" && (
                    <p className="copy fail">
                      自動コピーができませんでした。下の内容を選択してコピーし、{CONTACT_EMAIL} 宛にお送りください。
                    </p>
                  )}

                  <p style={{ margin: "10px 0 0" }}>
                    <button type="button" className="link-btn muted" onClick={() => setShowApplyText((v) => !v)}>
                      {showApplyText ? "申込内容を隠す" : "メールが開かない場合はこちら（申込内容を表示）"}
                    </button>
                  </p>
                  {showApplyText && (
                    <textarea readOnly className="apply-text" value={superviseApplyText}
                      onFocus={(e) => e.target.select()} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* フッター署名 */}
        <p className="sign">
          Pharma-Ad Lab｜医療広告・薬機法コンサルタント まさ（薬剤師）／ 法令DB {stats.law_count}件・ルール{stats.rule_version}（{stats.rule_count}件）
        </p>
      </div>
    </div>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#0f5b4e" />
      <rect x="196" y="74" width="120" height="58" rx="16" fill="#f3f1e9" />
      <rect x="182" y="148" width="148" height="298" rx="70" fill="#f3f1e9" />
      <path d="M182 326h148v50a70 70 0 0 1-70 70h-8a70 70 0 0 1-70-70z" fill="#d4451b" />
    </svg>
  );
}

function Arw() {
  return <span className="arw" aria-hidden="true" />;
}
