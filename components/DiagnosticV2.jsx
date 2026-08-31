import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { INDUSTRIES, MEDIA } from "../lib/taxonomy";
import stats from "../data/stats.json";
import { superviseFeeFor, buildSubject, buildMetaLines, buildApplyText, buildMailto } from "../lib/supervise";
import { inferContext } from "../lib/infer";
import { track } from "../lib/track";

// ===== 定数 =====
// 2回終わった時点で誘導カードを出し、3回で打ち止め。
// ⚠️ 必ず FREE < HARD にする。両方を同じ値にすると誘導カードが出る窓
//    （usageCount >= FREE && usageCount < HARD）が消え、誘導なしで打ち止めになる。
const FREE_LIMIT = 2;
const HARD_LIMIT = 3;
const LINE_URL = "https://lin.ee/7GlM6CT";
const CONTACT_EMAIL = "masa@med-ad-masa.com";

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
  "修正必須": { c: "#B42318", bg: "#FEF3F2", bd: "#FDA29B" },
  "要修正":   { c: "#B54708", bg: "#FFFAEB", bd: "#FEC84B" },
  "軽微修正": { c: "#175CD3", bg: "#EFF8FF", bd: "#84CAFF" },
  "問題なし": { c: "#067647", bg: "#ECFDF3", bd: "#75E0A7" },
};
const LEVEL_STYLE = {
  HIGH:   { c: "#B42318", bg: "#FEF3F2" },
  MEDIUM: { c: "#B54708", bg: "#FFFAEB" },
  LOW:    { c: "#175CD3", bg: "#EFF8FF" },
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

  // 打ち止めに到達した瞬間を1回だけ記録する
  const limitFired = useRef(false);
  useEffect(() => {
    if (isOverHardLimit && !limitFired.current) {
      limitFired.current = true;
      track("limit_reached", { limit: HARD_LIMIT });
    }
  }, [isOverHardLimit]);

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
    // 計測は広告文の本文を一切送らない（文字数のみ）
    track("diagnose_run", {
      attempt: usageCount + 1,
      industry: industry || "",
      media: media || "",
      auto_inferred: !manualPick,
      length: text.trim().length,
    });
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
  }, [canRun, text, industry, sub, media, clientIndustry, clientSub, usageCount, manualPick]);

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

  return (
    <div className="v2">
      {/* SSRで引用符が &quot; / &#x27; にエスケープされ、クライアントと文字列が一致せず
          ハイドレーションが失敗する（Next 14で再現）。__html で渡すとエスケープされない。 */}
      <style dangerouslySetInnerHTML={{ __html: `
        .v2 { --ink:#182430; --ink2:#44576B; --ink3:#8296A9; --line:#E3E9EF; --line2:#CBD6E0;
              --paper:#FFFFFF; --paper2:#F6F8FA; --acc:#0E5E6F; --acc-bg:#EAF4F5; --acc-bd:#9CC5CC;
              padding: 1.25rem 0 3rem; color: var(--ink); }
        .v2 .serif { font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif; }
        .v2 .card { background:var(--paper); border:1px solid var(--line); border-radius:14px; padding:1.25rem 1.4rem; margin-bottom:14px; }
        .v2 .step-num { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%;
              background:var(--ink); color:#fff; font-size:13px; font-weight:600; flex-shrink:0; }
        .v2 .step-num.done { background:var(--acc); }
        .v2 .step-num.off { background:var(--line2); }
        .v2 .step-head { display:flex; align-items:center; gap:10px; margin-bottom:4px; }
        .v2 .step-title { font-size:15px; font-weight:600; letter-spacing:0.01em; }
        .v2 .step-sub { font-size:12px; color:var(--ink3); margin:0 0 14px 36px; }
        .v2 .grid { display:grid; gap:8px; }
        .v2 .tile { text-align:left; padding:11px 13px; border-radius:10px; background:var(--paper); border:1px solid var(--line);
              cursor:pointer; transition:border-color .12s, background .12s; color:var(--ink); }
        .v2 .tile:hover { border-color:var(--acc-bd); background:var(--acc-bg); opacity:1; }
        .v2 .tile.on { border:1.5px solid var(--acc); background:var(--acc-bg); }
        .v2 .tile .t1 { font-size:13.5px; font-weight:600; }
        .v2 .tile .t2 { font-size:11px; color:var(--ink3); margin-top:2px; line-height:1.45; }
        .v2 .tile.on .t2 { color:var(--acc); }
        .v2 .ico { font-size:0.9em; opacity:0.45; margin-right:3px; filter:grayscale(0.35); }
        .v2 .chip { font-size:12.5px; padding:7px 14px; border-radius:999px; border:1px solid var(--line2); background:var(--paper);
              cursor:pointer; color:var(--ink2); font-weight:500; }
        .v2 .chip.on { background:var(--ink); border-color:var(--ink); color:#fff; }
        .v2 .btn-primary { background:var(--ink); color:#fff; border:none; padding:13px 34px; font-size:15px; font-weight:600;
              border-radius:10px; cursor:pointer; letter-spacing:0.03em; }
        .v2 .btn-primary:disabled { background:var(--line2); cursor:not-allowed; }
        .v2 .btn-ghost { background:var(--paper); color:var(--ink2); border:1px solid var(--line2); padding:6px 14px;
              font-size:12px; border-radius:8px; cursor:pointer; }
        .v2 mark { border-radius:3px; padding:0 2px; }
        .v2 mark.HIGH { background:#FEE4E2; color:#912018; }
        .v2 mark.MEDIUM { background:#FEF0C7; color:#7A2E0E; }
        .v2 mark.LOW { background:#D1E9FF; color:#194185; }
        .v2 textarea { width:100%; box-sizing:border-box; resize:vertical; padding:13px 15px; font-size:14px; line-height:1.8;
              border:1px solid var(--line2); border-radius:10px; background:var(--paper); color:var(--ink);
              font-family:inherit; outline:none; min-height:130px; }
        .v2 textarea:focus { border-color:var(--acc) !important; box-shadow:0 0 0 3px var(--acc-bg); }
        @keyframes v2spin { to { transform: rotate(360deg); } }
        @media (max-width:560px){ .v2 .card{ padding:1rem 1rem; } }
      ` }} />

      {/* ===== ヘッダー ===== */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--acc)", fontWeight: 600, margin: "0 0 6px" }}>
              PHARMA-AD LAB
            </p>
            <h1 className="serif" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.45, margin: "0 0 4px" }}>
              薬機レーダー
            </h1>
            <p style={{ fontSize: 12.5, letterSpacing: "0.02em", color: "var(--acc)", fontWeight: 600, margin: "0 0 9px" }}>
              薬機法・景表法・医療広告GL　AIチェック
            </p>
            <p style={{ fontSize: 13.5, lineHeight: 1.9, color: "var(--ink2)", margin: 0, maxWidth: 620 }}>
              広告文を貼るだけ。薬機法・景表法・医療広告GLなどに照らして、
              条文根拠つきでリスク箇所と修正案を返します。
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "var(--ink3)" }}>
              {isPro ? "✓ Pro（無制限）" : `残り ${Math.max(0, HARD_LIMIT - usageCount)}/${HARD_LIMIT}回`}
            </span>
            {isPro && <button className="btn-ghost" onClick={openPortal}>支払い・解約</button>}
            <button className="btn-ghost" onClick={() => { if (!showContact) track("cta_supervise_click", { source: "header" }); setShowContact(!showContact); }} style={{ borderColor: "var(--acc-bd)", color: "var(--acc)", fontWeight: 600 }}>
              監修相談
            </button>
          </div>
        </div>
      </div>

      {showContact && (
        <div className="card" style={{ background: "var(--acc-bg)", borderColor: "var(--acc-bd)" }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 6px", color: "var(--acc)" }}>広告監修・コンサルティングのご相談</p>
          <p style={{ fontSize: 13, color: "var(--ink2)", margin: "0 0 10px", lineHeight: 1.7 }}>
            LP全文精査・薬機法対応・継続監修契約など、薬剤師×医療広告コンプライアンス専門家として対応します。
          </p>
          <p style={{ margin: "0 0 12px" }}><a href="/consult" style={{ fontSize: 13, color: "var(--acc)", fontWeight: 600, textDecoration: "none" }}>監修サービスの詳細を見る →</a></p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn-ghost" style={{ textDecoration: "none" }} href={`mailto:${CONTACT_EMAIL}?subject=広告診断・監修相談&body=【ご相談内容】%0A%0A【業種・商材】%0A%0A【広告媒体】%0A%0A【ご予算】`}>📧 メールで相談</a>
            <a className="btn-ghost" style={{ textDecoration: "none" }} href="https://x.com/Pharma_Ad_Lab" target="_blank" rel="noopener noreferrer">𝕏 DMで相談</a>
            <a className="btn-ghost" style={{ textDecoration: "none" }} href="https://note.com/med_ad_consult" target="_blank" rel="noopener noreferrer">note</a>
          </div>
        </div>
      )}

      {/* ===== 上限到達 ===== */}
      {isOverHardLimit && (
        <div className="card" style={{ borderColor: "#FEC84B", background: "#FFFCF5" }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px", color: "#B54708" }}>無料診断回数を使い切りました</p>
          <p style={{ fontSize: 13, color: "var(--ink2)", margin: "0 0 12px", lineHeight: 1.7 }}>
            プランに登録すると引き続きご利用いただけます（いつでも解約可能）。
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {PLANS.map((p) => (
              <button key={p.key} type="button" onClick={() => startCheckout(p.key)} disabled={checkoutLoading !== ""}
                className="tile" style={{ flex: "1 1 200px", opacity: checkoutLoading !== "" && checkoutLoading !== p.key ? 0.5 : 1 }}>
                <span className="t1">{p.label}</span>
                <span style={{ display: "block", fontSize: 20, fontWeight: 700, color: "var(--acc)", margin: "2px 0" }}>
                  {p.price}<span style={{ fontSize: 12, fontWeight: 400 }}>{p.unit}</span>
                </span>
                <span className="t2">{checkoutLoading === p.key ? "決済ページへ移動中..." : p.note}</span>
              </button>
            ))}
          </div>
          <a href={`mailto:${CONTACT_EMAIL}?subject=広告診断・監修相談`} style={{ fontSize: 13, color: "var(--acc)", fontWeight: 600, textDecoration: "none" }}>
            または監修相談する →
          </a>
        </div>
      )}

      {/* ===== STEP 3 入力 ===== */}
      <div className="card">
        <div className="step-head">
          <span className="step-title" style={{ fontSize: 16 }}>広告文を貼り付ける</span>
        </div>
        <p className="step-sub" style={{ marginLeft: 0 }}>LP文言・SNS投稿・パッケージ文言などをそのまま貼り付けてください（8,000文字まで）。業種と媒体は本文から自動で判定します。</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
          placeholder={"例：飲むだけでみるみる痩せる！医師も推奨するサプリで、糖尿病の予防にも。"} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--ink3)" }}>サンプル:</span>
            {SAMPLES.map((s, i) => (
              <button key={i} type="button" className="chip" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => pickSample(s)}>{s.label}</button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "var(--ink3)" }}>{text.length}文字</span>
        </div>
      </div>


      {/* ===== 判定条件の確認（推定結果） ===== */}
      {!!text.trim() && (
        <div className="card" style={{ background: "var(--acc-bg)", borderColor: "var(--acc-bd)", padding: "0.9rem 1.2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--ink2)" }}>
              {manualPick ? "この条件で判定します：" : "本文から判定しました："}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--acc)" }}>
              {selectedIndustry?.label || "―"}
              {sub ? `・${selectedIndustry?.subs.find((x) => x.id === sub)?.label || ""}` : ""}
              {" ／ "}
              {MEDIA.find((m) => m.id === media)?.label || "―"}
            </span>
            <button type="button" className="btn-ghost" onClick={() => setPickerOpen((v) => !v)}
              style={{ marginLeft: "auto", borderColor: "var(--acc-bd)", color: "var(--acc)", fontWeight: 600 }}>
              {pickerOpen ? "閉じる" : "変更する"}
            </button>
          </div>
          {!manualPick && (
            <p style={{ fontSize: 11.5, color: "var(--ink3)", margin: "8px 0 0" }}>
              業種で適用される法令が変わります。違っていれば「変更する」で選び直してください。
            </p>
          )}
        </div>
      )}
      {/* ===== 実行 ===== */}
      <div style={{ textAlign: "center", margin: "20px 0 26px" }}>
        <button type="button" className="btn-primary" disabled={!canRun} onClick={run}>
          {loading ? "診断中..." : isOverHardLimit ? "利用上限に到達" : "リスク診断を実行 →"}
        </button>
        {!text.trim() && <p style={{ fontSize: 12, color: "var(--ink3)", marginTop: 8 }}>広告文を貼り付けてください</p>}
        {!!text.trim() && needsClient && !clientIndustry && <p style={{ fontSize: 12, color: "#B54708", marginTop: 8 }}>受託先（広告主）の業種を選んでください</p>}
      </div>


      {/* ===== 業種・媒体の手動選択（既定は閉じる） ===== */}
      {(pickerOpen || (needsClient && !clientIndustry)) && (
      <>
      {/* ===== STEP 1 業種 ===== */}
      <div className="card">
        <div className="step-head">
          <span className={`step-num ${step1Done ? "done" : ""}`}>1</span>
          <span className="step-title">クライアントの業種</span>
          {step1Done && <span style={{ fontSize: 12, color: "var(--acc)", fontWeight: 600 }}>✓ {selectedIndustry?.label}{sub ? `・${selectedIndustry?.subs.find((s) => s.id === sub)?.label}` : ""}</span>}
        </div>
        <p className="step-sub">業種で適用される法令が変わります（例：整骨院は柔整法、ペットフードは景表法＋公正競争規約）</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(158px,1fr))" }}>
          {INDUSTRIES.map((ind) => (
            <button key={ind.id} type="button" className={`tile ${industry === ind.id ? "on" : ""}`}
              onClick={() => { setManualPick(true); setIndustry(ind.id); setSub(null); if (ind.id !== "F") { setClientIndustry(null); setClientSub(null); } }}>
              <div className="t1"><span className="ico">{ind.icon}</span>{ind.label}</div>
              <div className="t2">{ind.desc}</div>
            </button>
          ))}
        </div>
        {selectedIndustry && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, color: "var(--ink3)", margin: "0 0 8px" }}>詳細（任意・選ぶと精度が上がります）</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {selectedIndustry.subs.map((s) => (
                <button key={s.id} type="button" className={`chip ${sub === s.id ? "on" : ""}`} onClick={() => { setManualPick(true); setSub(sub === s.id ? null : s.id); }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {needsClient && (
          <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--paper2)", borderRadius: 10 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, margin: "0 0 8px" }}>受託先（広告主）の業種 <span style={{ color: "#B42318" }}>必須</span></p>
            <p style={{ fontSize: 11.5, color: "var(--ink3)", margin: "0 0 8px" }}>制作物は受託先業種の規制を継承します。加えてステマ規制・表示主体責任をチェックします。</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {INDUSTRIES.filter((i) => i.id !== "F").map((i) => (
                <button key={i.id} type="button" className={`chip ${clientIndustry === i.id ? "on" : ""}`}
                  onClick={() => { setManualPick(true); setClientIndustry(i.id); setClientSub(null); }}>
                  <span className="ico">{i.icon}</span>{i.label}
                </button>
              ))}
            </div>
            {clientIndustryObj && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {clientIndustryObj.subs.map((s) => (
                  <button key={s.id} type="button" className={`chip ${clientSub === s.id ? "on" : ""}`} onClick={() => { setManualPick(true); setClientSub(clientSub === s.id ? null : s.id); }}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== STEP 2 媒体 ===== */}
      <div className="card">
        <div className="step-head">
          <span className={`step-num ${step2Done ? "done" : step1Done ? "" : "off"}`}>2</span>
          <span className="step-title">広告を出す媒体</span>
          {media && <span style={{ fontSize: 12, color: "var(--acc)", fontWeight: 600 }}>✓ {MEDIA.find((m) => m.id === media)?.label}</span>}
        </div>
        <p className="step-sub">媒体で「広告該当性」や要件が変わります（例：SNSはステマ規制、医療HPは限定解除）</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
          {MEDIA.map((m) => (
            <button key={m.id} type="button" className={`tile ${media === m.id ? "on" : ""}`} onClick={() => { setManualPick(true); setMedia(m.id); }}>
              <div className="t1"><span className="ico">{m.icon}</span>{m.label}</div>
            </button>
          ))}
        </div>
        {media && <p style={{ fontSize: 11.5, color: "var(--acc)", margin: "10px 0 0" }}>◎ {MEDIA.find((m) => m.id === media)?.note}</p>}
      </div>

      </>
      )}
      {loading && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18, animation: "v2spin 1s linear infinite", display: "inline-block" }}>⟳</span>
          <span style={{ fontSize: 13.5, color: "var(--ink2)" }}>{stepMsg}</span>
        </div>
      )}

      {err && (
        <div className="card" style={{ background: "#FEF3F2", borderColor: "#FDA29B" }}>
          <p style={{ fontSize: 13, color: "#B42318", margin: "0 0 6px" }}>⚠ {err}</p>
          {!isOverHardLimit && <button className="btn-ghost" type="button" onClick={run}>もう一度試す</button>}
        </div>
      )}

      {/* ===== 結果 ===== */}
      {a && (
        <div ref={resultRef}>
          {/* 判定ヘッダー */}
          <div className="card" style={{ borderColor: jStyle.bd, background: jStyle.bg }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: 11, letterSpacing: "0.1em", color: jStyle.c, fontWeight: 600, margin: "0 0 4px" }}>最終判定</p>
                <p className="serif" style={{ fontSize: 30, fontWeight: 700, color: jStyle.c, margin: 0, lineHeight: 1.2 }}>{a.final_judgment}</p>
              </div>
              <div style={{ display: "flex", gap: 22, textAlign: "center" }}>
                <div>
                  <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: jStyle.c }}>{a.risk_score}</p>
                  <p style={{ fontSize: 11, color: "var(--ink3)", margin: 0 }}>リスクスコア</p>
                </div>
                <div>
                  <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "#067647" }}>{a.sayable?.length || 0}</p>
                  <p style={{ fontSize: 11, color: "var(--ink3)", margin: 0 }}>言える切り口</p>
                </div>
                <div>
                  <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "var(--ink)" }}>{a.risk_items?.length || 0}</p>
                  <p style={{ fontSize: 11, color: "var(--ink3)", margin: 0 }}>直す点</p>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.8, color: "var(--ink)", margin: "12px 0 0" }}>{a.summary}</p>
          </div>

          {/* 原文ハイライト */}
          {highlighted && (
            <div className="card">
              <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>原文チェック <span style={{ fontWeight: 400, fontSize: 11, color: "var(--ink3)" }}>色付き＝指摘箇所</span></p>
              <p style={{ fontSize: 14, lineHeight: 2.0, margin: 0, whiteSpace: "pre-wrap" }}>
                {highlighted.map((s, i) => s.level
                  ? <mark key={i} className={s.level}>{s.t}</mark>
                  : <span key={i}>{s.t}</span>)}
              </p>
            </div>
          )}

          {/* 媒体注意 */}
          {a.media_notes && (
            <div className="card" style={{ background: "var(--acc-bg)", borderColor: "var(--acc-bd)" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--acc)", margin: "0 0 4px" }}>
                {MEDIA.find((m) => m.id === media)?.icon} この媒体での注意（{MEDIA.find((m) => m.id === media)?.label}）
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: "var(--ink)" }}>{a.media_notes}</p>
            </div>
          )}

          {/* 言える範囲（指摘より先に出す） */}
          {a.sayable?.length > 0 && (
            <div className="card" style={{ borderColor: "#ABEFC6", background: "#F6FEF9" }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 3px", color: "#067647" }}>この商材で言えること（{a.sayable.length}件）</p>
              <p style={{ fontSize: 11, color: "var(--ink3)", margin: "0 0 10px" }}>訴求を落とさずに使える切り口です。ここから組み立ててください</p>
              {a.sayable.map((s, i) => (
                <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid #D1FADF" : "none" }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, margin: "0 0 4px", color: "var(--ink)" }}>{s.angle}</p>
                  <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.7, color: "var(--ink)" }}>「{s.example}」</p>
                  {s.caveat && <p style={{ fontSize: 11.5, color: "var(--ink3)", margin: "5px 0 0", lineHeight: 1.6 }}>条件：{s.caveat}</p>}
                </div>
              ))}
            </div>
          )}

          {/* 直す点 */}
          {a.risk_items?.length > 0 && (
            <div className="card">
              <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 3px" }}>直す点（{a.risk_items.length}件）</p>
              <p style={{ fontSize: 11, color: "var(--ink3)", margin: "0 0 6px" }}>それぞれに代替案を付けています</p>
              {a.risk_items.map((item, i) => {
                const ls = LEVEL_STYLE[item.level] || LEVEL_STYLE.MEDIUM;
                return (
                  <div key={i} style={{ padding: "12px 0", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: ls.bg, color: ls.c, fontWeight: 700, flexShrink: 0 }}>{item.level}</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>「{item.expression}」</span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--ink2)", margin: "0 0 5px", lineHeight: 1.7 }}>{item.reason}</p>
                    {item.alternative && (
                      <div style={{ background: "#ECFDF3", borderRadius: 8, padding: "9px 11px", margin: "0 0 6px" }}>
                        <p style={{ fontSize: 10.5, color: "#067647", margin: "0 0 3px", fontWeight: 700 }}>こう直せば出せる</p>
                        <p style={{ fontSize: 13, margin: 0, lineHeight: 1.7, color: "var(--ink)" }}>{item.alternative}</p>
                      </div>
                    )}
                    <span style={{ fontSize: 11, color: "var(--acc)", background: "var(--acc-bg)", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                      {item.law}{item.law_id ? `（${item.law_id}）` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 修正提案 */}
          {a.suggestions?.length > 0 && (
            <div className="card">
              <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>修正提案</p>
              {a.suggestions.map((s, i) => (
                <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: "#FEF3F2", borderRadius: 8, padding: "9px 11px" }}>
                      <p style={{ fontSize: 10.5, color: "#B42318", margin: "0 0 3px", fontWeight: 700 }}>NG</p>
                      <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>{s.original}</p>
                    </div>
                    <div style={{ background: "#ECFDF3", borderRadius: 8, padding: "9px 11px" }}>
                      <p style={{ fontSize: 10.5, color: "#067647", margin: "0 0 3px", fontWeight: 700 }}>修正案</p>
                      <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>{s.revised}</p>
                    </div>
                  </div>
                  {s.point && <p style={{ fontSize: 12, color: "var(--ink3)", margin: "6px 0 0" }}>{s.point}</p>}
                </div>
              ))}
            </div>
          )}

          {/* 法的根拠（一次ソースリンク） */}
          {a.legal_basis?.length > 0 && (
            <div className="card">
              <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 3px" }}>法的根拠</p>
              <p style={{ fontSize: 11, color: "var(--ink3)", margin: "0 0 8px" }}>一次ソース（省庁・e-Gov等）で検証済みの法令データベースに基づく判定です</p>
              {/* 信頼の裏づけは「使う前」でなく「判定の根拠」として出す */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "8px 0 12px", borderBottom: "1px solid var(--line)", marginBottom: 12 }}>
                {[
                  [`${stats.law_count}法令DB`, "一次ソース検証済み"],
                  ["条文根拠つき", "law_idで法令に紐づく判定"],
                  [`ルールブック ${stats.rule_version}`, `${stats.rule_updated} 更新・${stats.rule_count}項目`],
                ].map(([t, d], i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--ink3)" }}>
                    <span style={{ color: "var(--ink)", fontWeight: 600 }}>{t}</span>　{d}
                  </div>
                ))}
              </div>
              {a.legal_basis.map((b, i) => {
                const node = res.laws?.find((l) => l.id === b.law_id);
                return (
                  <div key={i} style={{ padding: "9px 0", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px" }}>
                      {b.name} <span style={{ fontSize: 11, color: "var(--ink3)", fontWeight: 400 }}>{node?.article || ""}</span>
                    </p>
                    <p style={{ fontSize: 12.5, color: "var(--ink2)", margin: 0, lineHeight: 1.7 }}>{b.point}</p>
                    {node?.source_urls?.[0] && (
                      <a href={node.source_urls[0]} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: "var(--acc)", textDecoration: "none" }}>一次ソースを確認 ↗</a>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* アドバイス */}
          {a.advice && (
            <div className="card" style={{ background: "var(--paper2)" }}>
              <p style={{ fontSize: 11, color: "var(--ink3)", margin: "0 0 4px" }}>薬剤師・広告コンサルより</p>
              <p className="serif" style={{ fontSize: 14, lineHeight: 1.9, margin: 0 }}>{a.advice}</p>
            </div>
          )}

          {/* ルール照合（折りたたみ） */}
          {res.matches?.length > 0 && (
            <div className="card" style={{ background: "var(--paper2)" }}>
              <button type="button" onClick={() => setShowRules(!showRules)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--ink)", width: "100%", textAlign: "left" }}>
                {showRules ? "▼" : "▶"} ルールブック照合（{res.matchCount}件マッチ・{res.engine?.rulebook}）
              </button>
              {showRules && res.matches.map((m, i) => (
                <div key={i} style={{ padding: "8px 0", borderTop: "1px solid var(--line)", marginTop: i === 0 ? 10 : 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: m.risk >= 90 ? "#B42318" : m.risk >= 75 ? "#B54708" : "#175CD3" }}>{m.risk}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{m.ng.slice(0, 32)}</span>
                    <span style={{ fontSize: 10, color: "var(--ink3)" }}>{m.genre}</span>
                    {m.law_ids?.map((l) => <span key={l} style={{ fontSize: 10, color: "var(--acc)" }}>{l}</span>)}
                  </div>
                  {m.comment && <p style={{ fontSize: 12, color: "var(--ink2)", margin: 0, lineHeight: 1.6 }}>{m.comment}</p>}
                </div>
              ))}
            </div>
          )}

          {/* LINE誘導 */}
          {isOverFreeLimit && !isOverHardLimit && (
            <div className="card" style={{ background: "#ECFDF3", borderColor: "#75E0A7" }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 6px", color: "#067647" }}>LINE登録で最新の法規制アップデートを配信中</p>
              <p style={{ fontSize: 12.5, color: "var(--ink2)", margin: "0 0 10px", lineHeight: 1.7 }}>
                無料診断は残り{Math.max(0, HARD_LIMIT - usageCount)}回。広告監修のご相談もLINEからどうぞ。
              </p>
              <a href={LINE_URL} target="_blank" rel="noopener noreferrer" onClick={() => track("cta_line_click", { used: usageCount })}
                style={{ display: "inline-block", fontSize: 13.5, padding: "9px 22px", borderRadius: 8, background: "#06C755", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
                LINE公式アカウントを登録
              </a>
            </div>
          )}

          {/* 免責＋CTA */}
          <div style={{ background: "#FFFCF5", border: "1px solid #FEC84B", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: "#7A2E0E", margin: 0, lineHeight: 1.6 }}>
              本ツールはAIによる一次診断です。最終的な適否判断は薬剤師×医療広告コンサルタントによる監修、または弁護士にご相談ください。
            </p>
          </div>
          {/* 有料監修の申込（診断内容から見積を確定して構造化して送る） */}
          <div className="card" style={{ border: "2px solid var(--ink)" }}>
            <p className="serif" style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>この診断を、薬剤師の監修で確定させる</p>
            <p style={{ fontSize: 12.5, color: "var(--ink2)", margin: "0 0 12px", lineHeight: 1.7 }}>
              AIの一次診断は参考情報です。掲載可否の確定と修正文の納品は、薬剤師・薬機法管理者による監修で行います。
            </p>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", background: "var(--bg2, #F8F8F6)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: 11, color: "var(--ink3)", margin: 0 }}>原稿の分量</p>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{text.length.toLocaleString()}文字</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: "var(--ink3)", margin: 0 }}>監修料金（3円/文字・税別）</p>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>¥{superviseFee.toLocaleString()}{superviseFee === 10000 && text.length * 3 < 10000 ? "（最低受託料金）" : ""}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: "var(--ink3)", margin: 0 }}>ご返信</p>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>1営業日以内</p>
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--ink3)", margin: "0 0 12px", lineHeight: 1.6 }}>
              上記が確定料金です（原稿の追加・リライト込みをご希望の場合は別途お見積り）。納品日はご返信時に確定します。
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <a href={superviseMailto} onClick={(e) => { track("cta_mailto_click", { used: usageCount }); handleSuperviseApply(e); }}
                style={{ display: "inline-block", fontSize: 14, padding: "11px 26px", borderRadius: 8, background: "var(--ink)", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
                申込内容をコピーしてメールを開く
              </a>
              <a href={`mailto:${CONTACT_EMAIL}?subject=広告診断・監修相談&body=【ご相談内容】%0A%0A【業種・商材】%0A%0A【広告媒体】%0A%0A【ご予算】`}
                className="btn-ghost" style={{ display: "inline-block", fontSize: 13, padding: "11px 20px", textDecoration: "none" }}>
                まずは無料で相談する
              </a>
            </div>

            {copyState === "ok" && (
              <p style={{ fontSize: 12.5, color: "var(--acc)", margin: "10px 0 0", lineHeight: 1.7 }}>
                ✓ 申込内容（原稿の全文つき）をコピーしました。開いたメールの本文に貼り付けて送信してください。
              </p>
            )}
            {copyState === "fail" && (
              <p style={{ fontSize: 12.5, color: "#7A2E0E", margin: "10px 0 0", lineHeight: 1.7 }}>
                自動コピーができませんでした。下の内容を選択してコピーし、{CONTACT_EMAIL} 宛にお送りください。
              </p>
            )}

            <p style={{ margin: "10px 0 0" }}>
              <button type="button" onClick={() => setShowApplyText((v) => !v)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: "var(--ink3)", textDecoration: "underline" }}>
                {showApplyText ? "申込内容を隠す" : "メールが開かない場合はこちら（申込内容を表示）"}
              </button>
            </p>
            {showApplyText && (
              <textarea readOnly value={superviseApplyText}
                onFocus={(e) => e.target.select()}
                style={{ width: "100%", minHeight: 180, marginTop: 8, fontSize: 12, lineHeight: 1.7, padding: 10,
                         border: "1px solid var(--line2)", borderRadius: 8, background: "var(--paper2)", color: "var(--ink)" }} />
            )}
          </div>
        </div>
      )}

      {/* フッター署名 */}
      <p style={{ fontSize: 11, color: "var(--ink3)", textAlign: "center", marginTop: 26 }}>
        Pharma-Ad Lab｜医療広告・薬機法コンサルタント まさ（薬剤師）／ 法令DB {stats.law_count}件・ルール{stats.rule_version}（{stats.rule_count}件）
      </p>
    </div>
  );
}
