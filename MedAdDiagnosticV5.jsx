import { useState, useCallback, useEffect } from "react";
import rulebookData from "./rulebook.json";

// ルールブック v10 - 491件（rulebook.jsonから読み込み）
const RB = rulebookData.RB;

// 補完キーワード（rulebook.jsonから読み込み）
const EX = rulebookData.EX;

// ルール件数（rulebook.jsonから動的算出。ラベルのstale化を防ぐ）
const RULE_COUNT = RB.length;
const RULE_VER = "v10";

const CLIENTS = [
  {id:"all",  label:"すべて",           icon:"🔍", desc:"業種問わず診断"},
  {id:"d2c",  label:"D2C・健康食品",    icon:"💊", desc:"サプリ・食品・機能性素材"},
  {id:"cosm", label:"化粧品・美容",     icon:"✨", desc:"スキンケア・ヘアケア"},
  {id:"clin", label:"クリニック・医療", icon:"🏥", desc:"美容クリニック・歯科"},
  {id:"agcy", label:"広告代理店・制作", icon:"📱", desc:"LP・SNS広告制作"},
  {id:"infl", label:"インフルエンサー", icon:"📣", desc:"個人発信・アフィリエイト"},
];

const SAMPLES = [
  {label:"① 健康食品",
   text:"脳のゴミを減らすサプリ。毎日飲むだけで記憶力が向上し、アンチエイジング効果も期待できます。疲労回復にも最適で、泥のように眠れると大好評！脂肪燃焼もサポートします。"},
  {label:"② 化粧品",
   text:"このコラーゲン美容液でシミが消える！たるんだ肌へ直接アプローチ。細胞を活性化させ若返りをサポート。テーピング効果でリフトアップ！アンチエイジングの新常識。"},
  {label:"③ 重大疾病",
   text:"免疫力を高め、がん予防にも。血圧を下げる成分配合。医療現場でも広く用いられています。副作用なしで100%安全！薬がいらなくなったというお声も。"},
  {label:"④ クリニック",
   text:"当院のオリジナル施術で、シワが消える・たるみを取る・発毛効果が期待できます。医師推薦！満足度93%。アトピーや花粉症でお悩みの方にも対応しています。"},
];

// ===== 利用制限の閾値 =====
const FREE_LIMIT = 3;          // 1〜3回: 通常診断
const LINE_LIMIT = 6;          // 4〜6回: 通常診断+LINE誘導
const HARD_LIMIT = 6;          // 7回目以降: 診断停止+監修相談へ
const LINE_URL = "https://lin.ee/7GlM6CT";  // ← LINE公式アカウント取得後に書き換え
const CONTACT_EMAIL = "masa@med-ad-masa.com";

// ===== サブスクプラン（Stripe / テストモード）=====
const PLANS = [
  { key: "individual", label: "個人プラン", price: "¥500", unit: "/月", note: "個人・小規模の方向け" },
  { key: "corporate",  label: "法人プラン", price: "¥5,000", unit: "/月", note: "チーム・代理店向け" },
];

// マッチング
function matchRules(text) {
  const matched = [];
  const seen = new Set();
  const norm = text.toLowerCase().replace(/[　\s]/g, "");
  const allRules = [
    ...RB.map(r => ({id:r[0],ng:r[1],risk:r[2],genre:r[3],comment:r[4],ok:r[5],law:r[6],jcia:r[7]})),
    ...EX.map(r  => ({id:r[0],ng:r[1],risk:r[2],genre:r[3],comment:r[4],ok:r[5],law:r[6],jcia:r[7]})),
  ];
  for (const rule of allRules) {
    if (seen.has(rule.id)) continue;
    const ng = (rule.ng || "").replace(/[　\s×△○＊]+/g,"").trim();
    if (!ng || ng.length < 2) continue;
    const normNg = ng.toLowerCase();
    const words = ng.split(/[、。，,\s]+/).filter(w=>w.length>=2);
    const direct  = ng.length<=14 && norm.includes(normNg);
    const keyword = ng.length>=3  && ng.length<=7 && norm.includes(normNg);
    const phrase  = words.length>=2 && words.filter(w=>norm.includes(w.toLowerCase())).length>=Math.min(2,words.length);
    if (direct || keyword || phrase) {
      seen.add(rule.id);
      matched.push(rule);
    }
  }
  return matched.sort((a,b) => b.risk - a.risk);
}

function riskLv(score) {
  if (score >= 90) return {label:"HIGH",   c:"var(--color-text-danger)",  bg:"var(--color-background-danger)"};
  if (score >= 75) return {label:"MEDIUM", c:"var(--color-text-warning)", bg:"var(--color-background-warning)"};
  return                  {label:"LOW",    c:"var(--color-text-success)", bg:"var(--color-background-success)"};
}

// 堅牢パース
function safeParseJSON(raw) {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) return extractPartialFields(s);
  s = s.slice(start, end + 1);
  try { return JSON.parse(s); } catch(e) {}
  let s2 = s.replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, " ");
  try { return JSON.parse(s2); } catch(e) {}
  let s3 = s2.replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ");
  try { return JSON.parse(s3); } catch(e) {}
  try {
    const s4 = s3.replace(/("[^"]*":\s*")((?:[^"\\]|\\.)*?)("(?=\s*[,}\]]))/g, (m, p1, p2, p3) =>
      p1 + p2.replace(/"/g, '\\"') + p3);
    return JSON.parse(s4);
  } catch(e) {}
  return extractPartialFields(s);
}

function extractPartialFields(s) {
  if (!s) return null;
  const result = {};
  const orMatch = s.match(/"overall_risk"\s*:\s*"(HIGH|MEDIUM|LOW)"/);
  if (orMatch) result.overall_risk = orMatch[1];
  const rsMatch = s.match(/"risk_score"\s*:\s*(\d+)/);
  if (rsMatch) result.risk_score = parseInt(rsMatch[1]);
  const smMatch = s.match(/"summary"\s*:\s*"([^"]+)"/);
  if (smMatch) result.summary = smMatch[1];
  const adMatch = s.match(/"advice"\s*:\s*"([^"]+)"/);
  if (adMatch) result.advice = adMatch[1];
  result.risk_items = [];
  const itemRegex = /\{\s*"expression"\s*:\s*"([^"]+)"[^}]*?"reason"\s*:\s*"([^"]+)"[^}]*?"law"\s*:\s*"([^"]*)"[^}]*?"level"\s*:\s*"(HIGH|MEDIUM|LOW)"\s*\}/g;
  let m;
  while ((m = itemRegex.exec(s)) !== null) {
    result.risk_items.push({expression:m[1], reason:m[2], law:m[3], level:m[4]});
  }
  result.suggestions = [];
  const sugRegex = /\{\s*"original"\s*:\s*"([^"]+)"[^}]*?"revised"\s*:\s*"([^"]+)"[^}]*?"point"\s*:\s*"([^"]*)"\s*\}/g;
  while ((m = sugRegex.exec(s)) !== null) {
    result.suggestions.push({original:m[1], revised:m[2], point:m[3]});
  }
  if (result.overall_risk && result.risk_score !== undefined && result.summary) {
    result.advice = result.advice || "詳細は専門家にご相談ください。";
    return result;
  }
  return null;
}

async function diagnose(text, matched, clientId) {
  const cLabel = CLIENTS.find(c=>c.id===clientId)?.label || "すべて";
  const ctx = matched.slice(0,10).map(r=>
    `- NG「${r.ng.slice(0,25)}」(${r.risk}) ${(r.comment||"").slice(0,50)}`
  ).join("\n");

  const systemPrompt = `あなたは薬剤師資格を持つ医療広告コンプライアンス専門家。薬機法・景表法・医療広告GL・粧工連ガイドライン2020年版に精通。クライアント:${cLabel}

【最重要】必ず有効なJSONのみで応答する。JSON以外の文字（前置き・後置き・コードブロック）は一切含めない。値の中には改行を含めず、ダブルクォートを使う場合は必ずバックスラッシュでエスケープする。

スキーマ:
{
  "overall_risk": "HIGH/MEDIUM/LOW",
  "risk_score": 0から100の整数,
  "summary": "総評を1-2文で（改行・引用符不可）",
  "risk_items": [{"expression": "問題表現", "reason": "理由", "law": "関連法令", "level": "HIGH/MEDIUM/LOW"}],
  "suggestions": [{"original": "元の表現", "revised": "修正案", "point": "改善ポイント"}],
  "advice": "薬剤師からのひとこと（改行・引用符不可）"
}`;

  const userPrompt = `クライアント:${cLabel}\n広告文:${text}\n\nルールマッチ(${matched.length}件):\n${ctx || "直接マッチなし"}\n\nJSONのみで返答。`;

  const res = await fetch("/api/diagnose", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-sonnet-4-6",
      max_tokens:2000,
      system: systemPrompt,
      messages:[{role:"user", content: userPrompt}]
    })
  });

  if (!res.ok) throw new Error(`API応答エラー (${res.status})`);
  const data = await res.json();
  const raw  = data.content?.find(c=>c.type==="text")?.text || "";
  if (!raw) throw new Error("AI応答が空です。再試行してください。");
  const parsed = safeParseJSON(raw);
  if (!parsed) throw new Error("AI応答のJSON解析に失敗しました。もう一度お試しください。");
  if (!parsed.risk_items) parsed.risk_items = [];
  if (!parsed.suggestions) parsed.suggestions = [];
  if (!parsed.advice) parsed.advice = "";
  return parsed;
}

export default function App() {
  const [text,      setText]      = useState("");
  const [clientId,  setClientId]  = useState("all");
  const [loading,   setLoading]   = useState(false);
  const [stepMsg,   setStepMsg]   = useState("");
  const [hits,      setHits]      = useState([]);
  const [result,    setResult]    = useState(null);
  const [err,       setErr]       = useState("");
  const [showContact, setShowContact] = useState(false);
  const [usageCount, setUsageCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = window.localStorage.getItem("med_ad_usage");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isPro, setIsPro] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("med_ad_pro") === "1";
  });
  const [checkoutLoading, setCheckoutLoading] = useState("");

  // Stripe Checkout からの復帰を処理（?checkout=success → Pro解放）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (!status) return;
    if (status === "success") {
      window.localStorage.setItem("med_ad_pro", "1");
      setIsPro(true);
    }
    params.delete("checkout");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  const startCheckout = useCallback(async (plan) => {
    setErr("");
    setCheckoutLoading(plan);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.url && typeof window !== "undefined") {
        window.location.href = data.url;
        return;
      }
      throw new Error(data.error || "決済ページの作成に失敗しました");
    } catch (e) {
      setErr(e.message || "決済の開始に失敗しました");
      setCheckoutLoading("");
    }
  }, []);

  const isOverFreeLimit = usageCount >= FREE_LIMIT && !isPro;
  const isOverHardLimit = usageCount >= HARD_LIMIT && !isPro;

  const run = useCallback(async (t) => {
    const inputText = t ?? text;
    if (!inputText?.trim()) return;
    if (isOverHardLimit) {
      setErr("無料診断回数を使い切りました。詳細な広告監修サービスをご利用ください。");
      return;
    }
    setLoading(true); setResult(null); setErr(""); setHits([]);
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt === 1) setStepMsg(`ルールブック${RULE_VER}（${RULE_COUNT}件）と照合中...`);
        else setStepMsg(`再試行中... (${attempt}/3)`);
        const m = matchRules(inputText);
        setHits(m);
        setStepMsg(`${m.length}件マッチ。AI診断中... ${attempt > 1 ? `(再試行${attempt})` : ""}`);
        const ai = await diagnose(inputText, m, clientId);
        setResult(ai);
        setUsageCount(c => {
          const next = c + 1;
          if (typeof window !== "undefined") {
            window.localStorage.setItem("med_ad_usage", next);
          }
          return next;
        });
        lastErr = null;
        break;
      } catch(e) {
        lastErr = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, 800));
      }
    }
    if (lastErr) setErr(lastErr.message);
    setLoading(false);
    setStepMsg("");
  }, [text, clientId, isOverHardLimit]);

  // サンプル選択：テキストのみ反映、クライアント種別は維持
  const pickSample = useCallback((s) => {
    setText(s.text);
    // ※ clientIdは上書きしない（ユーザーの選択を尊重）
  }, []);

  const rl = result ? riskLv(result.risk_score||0) : null;
  const C  = (mb=12) => ({background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem",marginBottom:mb});

  return (
    <div style={{padding:"1.5rem 0",fontFamily:"var(--font-sans)"}}>

      {/* ===== HERO（誰向け・何が解ける・なぜ作ったか） ===== */}
      <div style={{
        position:"relative",
        background:"var(--color-background-secondary)",
        border:"0.5px solid var(--color-border-tertiary)",
        borderRadius:"var(--border-radius-lg)",
        padding:"1.75rem 1.5rem",
        marginBottom:"1.25rem",
        overflow:"hidden"
      }}>
        <div style={{
          position:"absolute",top:0,left:0,width:"100%",height:3,
          background:"linear-gradient(90deg, var(--color-border-info), var(--color-border-success))"
        }}/>
        <span style={{
          display:"inline-block",fontSize:11,letterSpacing:"0.08em",
          color:"var(--color-text-info)",background:"var(--color-background-info)",
          padding:"3px 10px",borderRadius:"var(--border-radius-md)",fontWeight:500,marginBottom:12
        }}>薬剤師 × 医療広告コンサルが設計</span>

        <h1 style={{fontSize:24,fontWeight:600,lineHeight:1.4,margin:"0 0 10px",color:"var(--color-text-primary)"}}>
          その広告文、出す前に薬機法リスクを一次診断。
        </h1>
        <p style={{fontSize:14,lineHeight:1.8,color:"var(--color-text-secondary)",margin:"0 0 18px",maxWidth:680}}>
          LP・SNS投稿・商品ページの文言を貼り付けるだけで、薬機法・景表法・医療広告ガイドラインの観点から
          リスク箇所と修正案を返します。判断に迷う前の「最初の一手」として使う想定です。最終的な適否判断は人による監修で詰めます。
        </p>

        {/* 誰向け */}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:18}}>
          {["D2C・健康食品","化粧品・美容","クリニック","広告代理店","個人発信・アフィリ"].map((t,i)=>(
            <span key={i} style={{
              fontSize:12,color:"var(--color-text-primary)",
              background:"var(--color-background-primary)",
              border:"0.5px solid var(--color-border-tertiary)",
              padding:"4px 11px",borderRadius:"var(--border-radius-md)"
            }}>{t}</span>
          ))}
        </div>

        {/* 3つの価値 */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:18}}>
          {[
            {n:RULE_COUNT+"件", t:"現場ルールで照合", d:"案件で見つけたNG表現を反映し続ける成長型ルールブック"},
            {n:"3観点", t:"横断チェック", d:"薬機法・景表法・医療広告GLを一度に確認"},
            {n:"修正案", t:"NG→OKを併記", d:"指摘だけで終わらせず、書き換え方向まで提示"},
          ].map((v,i)=>(
            <div key={i} style={{
              background:"var(--color-background-primary)",
              border:"0.5px solid var(--color-border-tertiary)",
              borderRadius:"var(--border-radius-md)",padding:"12px 14px"
            }}>
              <div style={{fontSize:20,fontWeight:600,color:"var(--color-text-info)",lineHeight:1.2}}>{v.n}</div>
              <div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",margin:"3px 0 4px"}}>{v.t}</div>
              <div style={{fontSize:11,color:"var(--color-text-tertiary)",lineHeight:1.5}}>{v.d}</div>
            </div>
          ))}
        </div>

        {/* なぜまさが作ったか＋導線 */}
        <div style={{
          borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:14,
          display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,flexWrap:"wrap"
        }}>
          <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:0,lineHeight:1.7,maxWidth:420}}>
            制作：医療広告コンサル まさ（薬剤師／薬機法管理者／景表法第1級）。
            企業内薬剤師として健康食品分野に携わりながら、広告代理店・メーカー・医療機関の案件に向き合う中で
            溜まった判断軸をツール化しました。
          </p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <a href={LINE_URL} target="_blank" rel="noopener noreferrer"
              style={{fontSize:12,padding:"6px 14px",borderRadius:"var(--border-radius-md)",background:"#06C755",color:"#fff",border:"0.5px solid #06C755",textDecoration:"none",fontWeight:500}}>💬 LINEで相談・更新を受け取る</a>
            <a href="https://note.com/med_ad_consult" target="_blank" rel="noopener noreferrer"
              style={{fontSize:12,padding:"6px 14px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",border:"0.5px solid var(--color-border-tertiary)",textDecoration:"none"}}>📝 note</a>
            <a href="https://x.com/zero89314" target="_blank" rel="noopener noreferrer"
              style={{fontSize:12,padding:"6px 14px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",border:"0.5px solid var(--color-border-tertiary)",textDecoration:"none"}}>𝕏 @zero89314</a>
            <a href="https://crowdworks.jp/public/employees/1166920" target="_blank" rel="noopener noreferrer"
              style={{fontSize:12,padding:"6px 14px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",border:"0.5px solid var(--color-border-tertiary)",textDecoration:"none"}}>実績を見る</a>
          </div>
        </div>
      </div>

      {/* ヘッダー */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1.5rem",gap:12}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:500,margin:"0 0 3px",color:"var(--color-text-primary)"}}>医療広告リスク診断ツール</h2>
          <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:0}}>薬機法・景表法・医療広告GL・粧工連2020 | ルール{RULE_VER}（{RULE_COUNT}件）| β版</p>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{isPro ? "✓ Proプラン利用中（無制限）" : `残り ${Math.max(0, HARD_LIMIT - usageCount)}/${HARD_LIMIT}回`}</span>
          <button onClick={()=>setShowContact(!showContact)} style={{fontSize:13,padding:"7px 14px",borderRadius:"var(--border-radius-md)",fontWeight:500}}>📩 監修相談</button>
        </div>
      </div>

      {showContact && (
        <div style={{...C(12),background:"var(--color-background-info)",border:"0.5px solid var(--color-border-info)"}}>
          <p style={{fontSize:14,fontWeight:500,margin:"0 0 8px",color:"var(--color-text-info)"}}>広告監修・コンサルティングのご相談</p>
          <p style={{fontSize:13,color:"var(--color-text-primary)",margin:"0 0 12px",lineHeight:1.7}}>LP全文精査・薬機法申請サポート・継続監修契約など、薬剤師×医療広告コンプライアンス専門家として対応します。</p>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <a href={`mailto:${CONTACT_EMAIL}?subject=医療広告診断・監修相談&body=【ご相談内容】%0A%0A【業種・商材】%0A%0A【広告媒体】%0A%0A【ご予算】`}
              style={{fontSize:13,padding:"8px 18px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",color:"var(--color-text-info)",border:"0.5px solid var(--color-border-info)",textDecoration:"none",fontWeight:500}}>📧 メールで相談</a>
            <a href="https://x.com/zero89314" target="_blank" rel="noopener noreferrer"
              style={{fontSize:13,padding:"8px 18px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",border:"0.5px solid var(--color-border-tertiary)",textDecoration:"none"}}>𝕏 DMで相談</a>
            <a href="https://note.com/med_ad_consult" target="_blank" rel="noopener noreferrer"
              style={{fontSize:13,padding:"8px 18px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",border:"0.5px solid var(--color-border-tertiary)",textDecoration:"none"}}>📝 note記事</a>
          </div>
        </div>
      )}

      {/* 利用制限到達時の表示 */}
      {isOverHardLimit && (
        <div style={{...C(12),background:"var(--color-background-warning)",border:"1px solid var(--color-border-warning)"}}>
          <p style={{fontSize:14,fontWeight:500,margin:"0 0 8px",color:"var(--color-text-warning)"}}>⏱️ 無料診断回数を使い切りました</p>
          <p style={{fontSize:13,color:"var(--color-text-primary)",margin:"0 0 12px",lineHeight:1.7}}>サブスクプランに登録すると、引き続き診断ツールをご利用いただけます（現在テスト決済・いつでも解約可能）。</p>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
            {PLANS.map((p) => (
              <button key={p.key} type="button" onClick={() => startCheckout(p.key)} disabled={checkoutLoading !== ""}
                style={{flex:"1 1 200px",textAlign:"left",padding:"12px 16px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-info)",cursor:checkoutLoading!==""?"wait":"pointer",opacity:checkoutLoading!==""&&checkoutLoading!==p.key?0.5:1}}>
                <span style={{display:"block",fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>{p.label}</span>
                <span style={{display:"block",fontSize:18,fontWeight:600,color:"var(--color-text-info)",margin:"2px 0"}}>{p.price}<span style={{fontSize:12,fontWeight:400}}>{p.unit}</span></span>
                <span style={{display:"block",fontSize:11,color:"var(--color-text-tertiary)"}}>{checkoutLoading===p.key?"決済ページへ移動中...":p.note}</span>
              </button>
            ))}
          </div>
          <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"0 0 8px"}}>または、人による監修・コンサルティングをご希望の方：</p>
          <a href={`mailto:${CONTACT_EMAIL}?subject=医療広告診断・監修相談`}
            style={{display:"inline-block",fontSize:14,padding:"10px 24px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-info)",color:"var(--color-text-info)",border:"0.5px solid var(--color-border-info)",textDecoration:"none",fontWeight:500}}>📩 監修相談する</a>
        </div>
      )}

      {/* クライアント種別 */}
      <div style={C(12)}>
        <p style={{fontSize:13,fontWeight:500,margin:"0 0 10px",color:"var(--color-text-primary)"}}>① クライアント種別を選択（クリックで切替）</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>
          {CLIENTS.map(c=>{
            const active = clientId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={()=>setClientId(c.id)}
                style={{
                  padding:"8px 10px",
                  borderRadius:"var(--border-radius-md)",
                  textAlign:"left",
                  cursor:"pointer",
                  background: active ? "var(--color-background-info)" : "var(--color-background-secondary)",
                  border: active ? "1.5px solid var(--color-border-info)" : "0.5px solid var(--color-border-tertiary)",
                  color: active ? "var(--color-text-info)" : "var(--color-text-primary)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                <div style={{fontSize:13,fontWeight:active?500:400}}>{active && "✓ "}{c.icon} {c.label}</div>
                <div style={{fontSize:10,color:active?"var(--color-text-info)":"var(--color-text-tertiary)",marginTop:2}}>{c.desc}</div>
              </button>
            );
          })}
        </div>
        <p style={{fontSize:11,color:"var(--color-text-tertiary)",margin:"8px 0 0"}}>選択中: <strong>{CLIENTS.find(c=>c.id===clientId)?.label}</strong></p>
      </div>

      {/* 入力エリア */}
      <div style={C(12)}>
        <p style={{fontSize:13,fontWeight:500,margin:"0 0 8px",color:"var(--color-text-primary)"}}>② 広告文を入力（直接入力 or サンプルから選択）</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
          {SAMPLES.map((s,i)=>(
            <button key={i} type="button" onClick={()=>pickSample(s)}
              style={{fontSize:12,padding:"5px 12px",borderRadius:"var(--border-radius-md)",cursor:"pointer",fontWeight:500}}
              title={s.text.slice(0,40)+"..."}>
              {s.label}
            </button>
          ))}
        </div>
        <p style={{fontSize:11,color:"var(--color-text-tertiary)",margin:"0 0 10px"}}>↑ サンプルクリックで広告文が入ります（クライアント種別はあなたの選択を維持）</p>
        <textarea
          value={text}
          onChange={e=>setText(e.target.value)}
          placeholder="広告文・LP文言・SNS投稿をここに入力してください。&#10;&#10;例：脳のゴミを減らすサプリ。記憶力が向上し、シミが消える！"
          rows={5}
          spellCheck={false}
          style={{
            width:"100%",boxSizing:"border-box",resize:"vertical",
            padding:"10px 12px",fontSize:14,
            border:"0.5px solid var(--color-border-secondary)",
            borderRadius:"var(--border-radius-md)",
            background:"var(--color-background-secondary)",
            color:"var(--color-text-primary)",
            fontFamily:"var(--font-sans)",outline:"none"
          }}
        />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
          <span style={{fontSize:12,color:"var(--color-text-tertiary)"}}>{text.length}文字</span>
          <button type="button" onClick={()=>run()} disabled={loading||!text.trim()||isOverHardLimit} style={{
            padding:"8px 24px",fontWeight:500,fontSize:14,borderRadius:"var(--border-radius-md)",
            opacity:!text.trim()||loading||isOverHardLimit?0.5:1,
            cursor:!text.trim()||loading||isOverHardLimit?"not-allowed":"pointer"
          }}>
            {loading?"診断中...":isOverHardLimit?"利用上限に到達":"③ 診断する →"}
          </button>
        </div>
      </div>

      {/* ローディング */}
      {loading&&(
        <div style={{...C(12),display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:18,animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span>
          <span style={{fontSize:14,color:"var(--color-text-secondary)"}}>{stepMsg}</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* エラー */}
      {err&&(
        <div style={{background:"var(--color-background-danger)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem",marginBottom:12}}>
          <p style={{fontSize:13,color:"var(--color-text-danger)",margin:"0 0 6px"}}>⚠ {err}</p>
          {!isOverHardLimit && <button type="button" onClick={()=>run()} style={{fontSize:12,padding:"4px 12px",borderRadius:"var(--border-radius-md)"}}>もう一度試す</button>}
        </div>
      )}

      {/* 診断結果 */}
      {result&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:12}}>
            {[
              {label:"総合リスクスコア", val:result.risk_score, sub:rl.label, badge:true, c:rl.c, bg:rl.bg},
              {label:"ルールマッチ",     val:hits.length,      sub:"件検出"},
              {label:"修正提案",         val:result.suggestions?.length||0, sub:"件"},
            ].map((c,i)=>(
              <div key={i} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"1rem",textAlign:"center"}}>
                <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"0 0 4px"}}>{c.label}</p>
                <p style={{fontSize:30,fontWeight:500,margin:0,color:c.c||"var(--color-text-primary)"}}>{c.val}</p>
                {c.badge
                  ? <span style={{fontSize:12,padding:"2px 10px",borderRadius:"var(--border-radius-md)",background:c.bg,color:c.c,fontWeight:500}}>{c.sub}</span>
                  : <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{c.sub}</span>
                }
              </div>
            ))}
          </div>

          <div style={C(12)}>
            <p style={{fontSize:13,fontWeight:500,margin:"0 0 8px",color:"var(--color-text-primary)"}}>📋 総評</p>
            <p style={{fontSize:14,color:"var(--color-text-primary)",margin:"0 0 10px",lineHeight:1.7}}>{result.summary}</p>
            {result.advice&&(
              <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"10px 12px",borderLeft:"3px solid var(--color-border-info)"}}>
                <p style={{fontSize:11,color:"var(--color-text-secondary)",margin:"0 0 3px"}}>薬剤師・医療広告コンサルより</p>
                <p style={{fontSize:13,color:"var(--color-text-primary)",margin:0}}>{result.advice}</p>
              </div>
            )}
          </div>

          {result.risk_items?.length>0&&(
            <div style={C(12)}>
              <p style={{fontSize:13,fontWeight:500,margin:"0 0 12px",color:"var(--color-text-primary)"}}>⚠️ 問題表現 ({result.risk_items.length}件)</p>
              {result.risk_items.map((item,i)=>{
                const r=riskLv(item.level==="HIGH"?90:item.level==="MEDIUM"?80:65);
                return(
                  <div key={i} style={{padding:"10px 0",borderTop:i>0?"0.5px solid var(--color-border-tertiary)":"none"}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:4}}>
                      <span style={{fontSize:11,padding:"2px 7px",borderRadius:"var(--border-radius-md)",background:r.bg,color:r.c,fontWeight:500,flexShrink:0}}>{item.level}</span>
                      <span style={{fontSize:14,fontWeight:500,color:"var(--color-text-primary)"}}>{item.expression}</span>
                    </div>
                    <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:"0 0 2px"}}>{item.reason}</p>
                    {item.law&&<span style={{fontSize:11,color:"var(--color-text-tertiary)",fontFamily:"var(--font-mono)"}}>{item.law}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {result.suggestions?.length>0&&(
            <div style={C(12)}>
              <p style={{fontSize:13,fontWeight:500,margin:"0 0 12px",color:"var(--color-text-primary)"}}>✏️ 修正提案</p>
              {result.suggestions.map((s,i)=>(
                <div key={i} style={{padding:"10px 0",borderTop:i>0?"0.5px solid var(--color-border-tertiary)":"none"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div style={{background:"var(--color-background-danger)",borderRadius:"var(--border-radius-md)",padding:"8px 10px"}}>
                      <p style={{fontSize:11,color:"var(--color-text-danger)",margin:"0 0 3px",fontWeight:500}}>NG</p>
                      <p style={{fontSize:13,color:"var(--color-text-primary)",margin:0}}>{s.original}</p>
                    </div>
                    <div style={{background:"var(--color-background-success)",borderRadius:"var(--border-radius-md)",padding:"8px 10px"}}>
                      <p style={{fontSize:11,color:"var(--color-text-success)",margin:"0 0 3px",fontWeight:500}}>修正案</p>
                      <p style={{fontSize:13,color:"var(--color-text-primary)",margin:0}}>{s.revised}</p>
                    </div>
                  </div>
                  {s.point&&<p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"6px 0 0"}}>{s.point}</p>}
                </div>
              ))}
            </div>
          )}

          {hits.length>0&&(
            <div style={{background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem",marginBottom:12}}>
              <p style={{fontSize:13,fontWeight:500,margin:"0 0 10px",color:"var(--color-text-primary)"}}>📚 ルールブック{RULE_VER} 照合結果 ({hits.length}件)</p>
              {hits.slice(0,8).map((m,i)=>{
                const r=riskLv(m.risk);
                return(
                  <div key={i} style={{padding:"8px 0",borderTop:i>0?"0.5px solid var(--color-border-tertiary)":"none"}}>
                    <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <span style={{fontSize:11,padding:"2px 7px",borderRadius:"var(--border-radius-md)",background:r.bg,color:r.c,fontWeight:500,flexShrink:0,minWidth:28,textAlign:"center"}}>{m.risk}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
                          <span style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>{m.ng.slice(0,30)}</span>
                          <span style={{fontSize:10,color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",padding:"1px 6px",borderRadius:4}}>{m.genre}</span>
                          {m.jcia && <span style={{fontSize:10,color:"var(--color-text-info)",background:"var(--color-background-info)",padding:"1px 6px",borderRadius:4,fontWeight:500}}>粧工連 {m.jcia}</span>}
                        </div>
                        {m.comment&&<p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"0 0 2px",lineHeight:1.5}}>{m.comment}</p>}
                        {m.ok&&m.ok!=="（具体的な代替表現なし）"&&m.ok!=="（記載不可）"&&(
                          <p style={{fontSize:11,color:"var(--color-text-success)",margin:0}}>✓ OK例: {m.ok.slice(0,45)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {hits.length>8&&<p style={{fontSize:12,color:"var(--color-text-tertiary)",margin:"8px 0 0"}}>他 {hits.length-8}件マッチ</p>}
            </div>
          )}

          {/* LINE誘導CTA（4-6回目）*/}
          {isOverFreeLimit && !isOverHardLimit && (
            <div style={{...C(12),background:"var(--color-background-success)",border:"1px solid var(--color-border-success)"}}>
              <p style={{fontSize:14,fontWeight:500,margin:"0 0 8px",color:"var(--color-text-success)"}}>🎁 LINE登録で続けて診断できます</p>
              <p style={{fontSize:13,color:"var(--color-text-primary)",margin:"0 0 12px",lineHeight:1.7}}>無料診断は残り{HARD_LIMIT - usageCount}回です。LINE公式アカウントへ登録すると、最新の薬機法アップデートや診断ツールの新機能も配信中。広告監修のご相談もLINEからどうぞ。</p>
              <a href={LINE_URL} target="_blank" rel="noopener noreferrer"
                style={{display:"inline-block",fontSize:14,padding:"10px 24px",borderRadius:"var(--border-radius-md)",background:"#06C755",color:"#fff",textDecoration:"none",fontWeight:500}}>
                💬 LINE公式アカウントを登録
              </a>
            </div>
          )}

          {/* 免責 */}
          <div style={{background:"var(--color-background-warning)",borderRadius:"var(--border-radius-md)",padding:"10px 14px",marginBottom:12}}>
            <p style={{fontSize:12,color:"var(--color-text-warning)",margin:0}}>⚠ 本ツールは一次診断です。最終的な法的判断は薬機法専門家・弁護士にご相談ください。</p>
          </div>

          {/* CTA */}
          <div style={{...C(0),textAlign:"center"}}>
            <p style={{fontSize:14,fontWeight:500,margin:"0 0 6px",color:"var(--color-text-primary)"}}>詳細な人による監修・コンサルティング</p>
            <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:"0 0 12px"}}>LP全文レビュー・薬機法申請・継続監修など対応</p>
            <a href={`mailto:${CONTACT_EMAIL}?subject=医療広告診断・監修相談&body=【ご相談内容】%0A%0A【業種・商材】%0A%0A【広告媒体】%0A%0A【ご予算】`}
              style={{display:"inline-block",fontSize:14,padding:"10px 28px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-info)",color:"var(--color-text-info)",border:"0.5px solid var(--color-border-info)",textDecoration:"none",fontWeight:500}}>
              📩 無料相談する
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
