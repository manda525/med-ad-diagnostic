// v2 診断エンジン（サーバー側）
// 業種×媒体で法令ノード＋ルールをフィルタし、Fable 5 用のプロンプトを構築する。

import lawMaster from "../data/law_master.json";
import rulebook from "../data/rulebook_v2.json";
import { INDUSTRIES, MEDIA, industryById, mediaById, lawApplies, ruleApplies } from "./taxonomy";

export const RULE_COUNT = rulebook.rules.length;
export const RULE_VER = rulebook.meta?.version || "v15";
export const LAW_COUNT = lawMaster.laws.length;

// ---- 否定文脈の検出 ----
// 規制を説明する文（「患者の体験談は掲載できません」）や不掲載の宣言
// （「使用前後の写真は、載せていません」）は、substring 照合では違反文と区別が
// つかない。コンプライアンスページや教育記事を貼った利用者に片っ端から赤が出る
// ので、一致語の直後に否定・禁止の語が続く場合は信頼度を落とす。
//
// 落とすだけで除外はしない。誤検知を消すために本物の違反を握り潰す方が損害が
// 大きいため、最終判定は AI 側に残す。
const NEGATION_WINDOW = 30;

// 一致語の直後だけを見る。文末記号と ※ で窓を切るのは、
// 「シミが消える。※効果を保証するものではありません」のような
// 別の文に付く免責文を、直前の主張に対する否定と読み違えないため。
const NEGATION_STOP = /[。！？!?※]/;

const NEGATION_MARKERS = [
  "ません", "できない", "言えない", "書けない", "使えない", "載せない",
  "使わない", "認められない", "してはいけ", "避けて", "控えて",
  "不可", "禁止", "違反", "対象外", "ng",
];

// 「効果を保証するものではありません」等の免責は、主張を打ち消さない。
// これを否定として扱うと、定型の免責文を添えた広告が全部素通りする。
const DISCLAIMER_MARKERS = ["ものではありません", "ものではない"];

function isNegated(norm, endIdx) {
  let win = norm.slice(endIdx, endIdx + NEGATION_WINDOW);
  const stop = win.search(NEGATION_STOP);
  if (stop >= 0) win = win.slice(0, stop);
  if (!win) return false;
  if (DISCLAIMER_MARKERS.some((d) => win.includes(d))) return false;
  return NEGATION_MARKERS.some((m) => win.includes(m));
}

// 語が複数回出るときは、1回でも否定でない出現があれば否定扱いにしない。
// 「体験談は載せられません。当店の体験談はこちら」のような文で
// 後段の実質的な訴求を見逃さないため。
function occursUnnegated(norm, term) {
  let i = norm.indexOf(term);
  if (i === -1) return null; // 不一致
  while (i !== -1) {
    if (!isNegated(norm, i + term.length)) return true;
    i = norm.indexOf(term, i + 1);
  }
  return false; // 一致したが全出現が否定文脈
}

// ---- ルールマッチング（旧 matchRules の改良版・上位10件足切り廃止） ----
export function matchRules(text, industryId, subId) {
  const norm = String(text).toLowerCase().replace(/[　\s]/g, "");
  const matched = [];
  for (const rule of rulebook.rules) {
    if (!ruleApplies(rule, industryId, subId)) continue;

    // 照合語が明示指定されているルールは、NG表現からの自動導出を使わない。
    // 正本のNG表現は法令の解説文であって照合用の語彙ではないため、自動導出が
    // 破綻するルールを data/match_overrides.json で救う。1文字の語もここでは有効。
    if (Array.isArray(rule.match) && rule.match.length > 0) {
      let hit = false;
      let clean = false;
      for (const t of rule.match) {
        const term = String(t).replace(/[　\s]/g, "").toLowerCase();
        if (!term) continue;
        const r = occursUnnegated(norm, term);
        if (r === null) continue;
        hit = true;
        if (r) { clean = true; break; }
      }
      if (hit) matched.push({ ...rule, matchType: "direct", negated: !clean });
      continue;
    }

    const raw = (rule.ng || "").replace(/[　\s×△○＊]+/g, "").trim();
    if (!raw || raw.length < 2) continue;
    // 「痩せる／必ず痩せる／運動なしで痩せる」のように ／・/ で区切られた
    // 複数表現は、いずれか1つでも一致すればヒット扱いにする。
    const alts = raw.split(/[／\/・]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
    let matchType = null;
    // 否定文脈でない一致が1つでもあれば、そのルールは否定扱いにしない。
    // phrase 一致は語が飛び飛びで出るため一致位置を特定できず、否定判定の
    // 対象外にしている（＝従来どおり素通しする）。
    let clean = false;
    for (const ng of alts) {
      // 末尾の補足（例「確実に（整体痩身）」）は照合対象から外す
      const core = ng.replace(/[（(].*?[）)]/g, "").trim();
      if (core.length < 2) continue;
      const normNg = core.toLowerCase();
      const words = core.split(/[、。，,\s]+/).filter((w) => w.length >= 2);
      const direct = core.length <= 14 && norm.includes(normNg);
      const keyword = core.length >= 3 && core.length <= 7 && norm.includes(normNg);
      const phrase =
        words.length >= 2 &&
        words.filter((w) => norm.includes(w.toLowerCase())).length >= Math.min(2, words.length);
      if (direct || keyword) clean = clean || occursUnnegated(norm, normNg) === true;
      // direct で確定しても、否定文脈だった場合は他の表現に否定でない一致が
      // ないかを見てから抜ける（clean を取りこぼすと信頼度を不当に下げる）
      if (direct) { matchType = "direct"; if (clean) break; continue; }
      if (keyword) matchType = matchType || "keyword";
      else if (phrase) { matchType = matchType || "phrase"; clean = true; }
    }
    if (matchType) matched.push({ ...rule, negated: !clean, matchType });
  }
  // direct > keyword > phrase、リスク降順。
  // 否定文脈の一致は信頼度を落として最後に回す（上位40件のプロンプト投入で
  // 実質的な一致に席を譲らせる）。除外はしない。
  const w = { direct: 2, keyword: 1, phrase: 0 };
  const score = (r) => w[r.matchType] - (r.negated ? 10 : 0);
  return matched.sort((a, b) => score(b) - score(a) || b.risk - a.risk);
}

// ---- 業種×媒体に適用される法令ノード ----
export function lawsFor(industryId, subId, mediaId) {
  return lawMaster.laws.filter((l) => lawApplies(l, industryId, subId, mediaId));
}

// ---- プロンプト構築 ----
export function buildPrompt(text, { industryId, subId, mediaId, clientIndustryId, clientSubId }) {
  // F（広告・制作）は受託先業種の規制を継承する
  const effIndustry = industryId === "F" && clientIndustryId ? clientIndustryId : industryId;
  const effSub = industryId === "F" && clientIndustryId ? clientSubId : subId;

  const ind = industryById(effIndustry);
  const sub = ind?.subs.find((s) => s.id === effSub);
  const med = mediaById(mediaId);

  const laws = lawsFor(effIndustry, effSub, mediaId);
  // F選択時はステマ・アフィリ責任も必ず含める
  if (industryId === "F") {
    for (const id of ["L-STEMA", "L-AFFILI", "L-YAKKI-66"]) {
      if (!laws.some((l) => l.id === id)) {
        const n = lawMaster.laws.find((l) => l.id === id);
        if (n) laws.push(n);
      }
    }
  }

  const matched = matchRules(text, effIndustry, effSub);
  const MAX_RULES_IN_PROMPT = 40;
  const rulesCtx = matched.slice(0, MAX_RULES_IN_PROMPT).map((r) =>
    `- [${r.id}|risk${r.risk}|${r.law_ids.join("/")}]${r.negated ? "【否定文脈の可能性】" : ""} NG「${r.ng.slice(0, 40)}」→ ${(r.comment || "").slice(0, 60)}${r.ok ? ` / OK例:${r.ok.slice(0, 40)}` : ""}`
  ).join("\n");
  const hasNegated = matched.slice(0, MAX_RULES_IN_PROMPT).some((r) => r.negated);

  const lawsCtx = laws.map((l) =>
    `### ${l.id} ${l.title}（${l.article}／${l.authority}）\n${l.summary}\n判定要点:\n${l.key_points.map((k) => `- ${k}`).join("\n")}`
  ).join("\n\n");

  const system = `あなたは薬剤師・薬機法管理者・景表法第1級・コスメ薬機法管理者の資格を持つ広告コンプライアンス専門家。以下の【適用法令データベース】は一次ソース（省庁・e-Gov・公正取引協議会）から構築された正確な法令情報である。判定は必ずこのデータベースの条文・判定要点に根拠づけて行うこと。

【クライアント業種】${ind?.label || "不明"}${sub ? `（${sub.label}）` : ""}${industryId === "F" ? "※広告・制作業として受託。受託先業種の規制を継承し、加えてステマ規制・表示主体責任を確認する" : ""}
【広告媒体】${med ? `${med.label} — ${med.note}` : "指定なし"}

【適用法令データベース】
${lawsCtx}

【この診断の目的】
広告を止めることではなく、**売れる表現で、かつ法令の範囲内に収めること**。
利用者は広告を出したい事業者であって、NGの数を知りたいわけではない。
「ダメ」で終わる出力は、たとえ正確でも役に立たない。

【出力の原則】
- **必ず sayable（言える範囲）を先に埋める。** この商材・業種・媒体で訴求可能な切り口を、
  具体的な言い回しの例つきで3〜5個。ここが空の診断は失敗とみなす
- **risk_items の各項目には alternative（代替案）を必ず入れる。** 「削除してください」は代替案ではない。
  その表現で伝えたかった訴求点を保ったまま、適法に言い換えた具体的な文を書く
- **同じ根拠・同じ類型の指摘はまとめて1件にする。** 指摘の件数を増やさない。
  「断定的効能」が3か所あるなら1件にまとめ、expression に代表例を挙げる
- 各指摘には必ず law_id（上記データベースのID）と条文名を紐づける
- 媒体特性（広告該当性・限定解除・ステマ・法定表示）を判定に織り込む
- **限定解除・付記・出典明示で成立するものは「禁止」と書かない。** 「〜を併記すれば掲載可」と書く

【リスク区分】
- HIGH   = そのまま出すと行政処分・刑事罰のリスクが現実的
- MEDIUM = 表現を直せば出せる。付記・限定解除・出典明示で成立する
- LOW    = 出せるが、より安全な言い方がある

【最終判定】は "修正必須" | "要修正" | "軽微修正" | "問題なし" の4段階。基準は次のとおり。
- **修正必須** … その訴求自体を取り下げる必要がある。疾病の治療・予防の標榜、承認・認証の範囲外、
  無資格での医業類似行為、処方箋医薬品の無処方箋供給、医療広告で限定解除の対象外のもの（体験談等）。
  **「言い換えれば出せる」ものをここに入れない**
- **要修正** … 表現を直せば出せる。断定を避ける、付記を足す、出典を明示する、主体を明示する等
- **軽微修正** … 出せるが、より安全な言い方がある
- **問題なし** … そのまま出せる

**迷ったら、法的評価は正確なまま、伝え方を「どうすれば出せるか」に寄せること。**
リスクを軽く見積もることと、伝え方を建設的にすることは別物である。前者はしてはならない。`;

  const user = `以下の広告文を診断してください。

【広告文】
${text}

【ルールブック照合結果】（${matched.length}件マッチ${matched.length > MAX_RULES_IN_PROMPT ? `・上位${MAX_RULES_IN_PROMPT}件を表示` : ""}）
${rulesCtx || "直接マッチなし（法令データベースに基づき判定すること）"}${hasNegated ? `

※【否定文脈の可能性】が付いたものは、照合器が語の一致だけで拾ったもので、原文では
「〜は掲載できません」「載せていません」のように**その表現を否定・禁止している**可能性がある。
規制を解説する記事やコンプライアンスページで起きる。原文を読み、実際に訴求していなければ
指摘に挙げないこと。逆に否定の体裁をとりながら実質的に訴求している場合は指摘する。` : ""}`;

  return { system, user, matched, laws, effIndustry, effSub };
}

// ---- 構造化出力スキーマ ----
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    overall_risk: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    risk_score: { type: "integer" },
    summary: { type: "string", description: "総評 1-3文。何が言えて、何を直せば出せるかを先に述べる" },
    media_notes: { type: "string", description: "選択媒体に特有の注意（広告該当性・限定解除・ステマ・法定表示等）。特になければ空文字" },
    sayable: {
      type: "array",
      description:
        "この商材・業種・媒体で訴求できる切り口を3〜5個。指摘より先に読ませる。空にしない",
      items: {
        type: "object",
        properties: {
          angle: { type: "string", description: "訴求の切り口（例：使用感・成分の含有量・使用シーン）" },
          example: { type: "string", description: "そのまま使える具体的な言い回しの例" },
          caveat: { type: "string", description: "この切り口を使うときの条件。無ければ空文字" },
        },
        required: ["angle", "example", "caveat"],
        additionalProperties: false,
      },
    },
    risk_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          expression: { type: "string", description: "問題のある表現（原文からの抜粋）" },
          reason: { type: "string" },
          law_id: { type: "string", description: "法令データベースのID（例 L-YAKKI-66）" },
          law: { type: "string", description: "条文名（例 薬機法第66条）" },
          level: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          alternative: {
            type: "string",
            description:
              "この表現の代替案。伝えたかった訴求点を保ったまま適法に言い換えた具体的な文。" +
              "限定解除や付記で成立する場合は「〜を併記すれば掲載可」と書く。" +
              "「削除してください」は代替案として認めない",
          },
        },
        required: ["expression", "reason", "law_id", "law", "level", "alternative"],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          revised: { type: "string" },
          point: { type: "string" },
        },
        required: ["original", "revised", "point"],
        additionalProperties: false,
      },
    },
    legal_basis: {
      type: "array",
      description: "この診断で根拠にした法令の要約",
      items: {
        type: "object",
        properties: {
          law_id: { type: "string" },
          name: { type: "string" },
          point: { type: "string", description: "この広告文との関係を1文で" },
        },
        required: ["law_id", "name", "point"],
        additionalProperties: false,
      },
    },
    advice: { type: "string", description: "薬剤師・広告コンサルからのひとこと" },
    final_judgment: { type: "string", enum: ["修正必須", "要修正", "軽微修正", "問題なし"] },
  },
  required: ["overall_risk", "risk_score", "summary", "media_notes", "sayable", "risk_items", "suggestions", "legal_basis", "advice", "final_judgment"],
  additionalProperties: false,
};
