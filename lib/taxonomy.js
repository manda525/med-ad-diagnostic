// 業種×媒体タクソノミー（クライアント/サーバー共用）
// requirements_v2.md §3-4 準拠。lawMaster の industries / media コードと対応する。

export const INDUSTRIES = [
  {
    id: "A", label: "医療機関", icon: "🏥",
    desc: "医療法・医療広告GLが適用",
    subs: [
      { id: "hospital", label: "病院・クリニック" },
      { id: "biyou",    label: "美容クリニック・美容皮膚科" },
      { id: "dental",   label: "歯科医院" },
      { id: "mental",   label: "精神科・心療内科" },
    ],
  },
  {
    id: "A2", label: "助産・薬局・在宅", icon: "🤱",
    desc: "医療法・薬機法・母子保健",
    subs: [
      { id: "midwife",  label: "助産院" },
      { id: "pharmacy", label: "調剤薬局・ドラッグストア" },
      { id: "houkan",   label: "訪問看護" },
    ],
  },
  {
    id: "B", label: "施術系（国家資格）", icon: "🦴",
    desc: "柔整法・あはき法の広告制限",
    subs: [
      { id: "judo",  label: "整骨院・接骨院" },
      { id: "ahaki", label: "鍼灸院・あん摩マッサージ" },
    ],
  },
  {
    id: "C", label: "施術系（民間資格）", icon: "🧘",
    desc: "医療誤認NG・景表法",
    subs: [
      { id: "seitai", label: "整体院" },
      { id: "chiro",  label: "カイロプラクティック" },
      { id: "relax",  label: "リラクゼーション・もみほぐし" },
    ],
  },
  {
    id: "D", label: "美容・健康サービス", icon: "💆",
    desc: "特商法・景表法・機器の薬機法",
    subs: [
      { id: "esthe",   label: "エステサロン" },
      { id: "datsumo", label: "脱毛・痩身サロン" },
      { id: "gym",     label: "パーソナルジム・フィットネス" },
      { id: "yoga",    label: "ヨガ・ピラティス" },
    ],
  },
  {
    id: "E", label: "物販・EC", icon: "🛒",
    desc: "薬機法・健増法・景表法",
    subs: [
      { id: "supp",   label: "健康食品・サプリ" },
      { id: "func",   label: "機能性表示食品・トクホ" },
      { id: "cosme",  label: "化粧品・コスメ" },
      { id: "quasi",  label: "医薬部外品（薬用）" },
      { id: "device", label: "美容・健康機器" },
    ],
  },
  {
    id: "F", label: "広告・制作・発信", icon: "📣",
    desc: "受託先の規制を継承＋ステマ規制",
    subs: [
      { id: "agency", label: "広告代理店・Web/LP制作" },
      { id: "affili", label: "アフィリエイター" },
      { id: "influ",  label: "インフルエンサー・SNS運用" },
    ],
  },
  {
    id: "G", label: "動物・ペット", icon: "🐕",
    desc: "獣医療法・ペットフード安全法",
    subs: [
      { id: "vet",      label: "動物病院" },
      { id: "petfood",  label: "ペットフード・おやつ" },
      { id: "petsupp",  label: "ペット用サプリ" },
      { id: "petgoods", label: "ペット用品" },
    ],
  },
];

export const MEDIA = [
  { id: "lp",      label: "LP（ランディングページ）", icon: "📄", note: "典型的な広告。限定解除要件・特商法表示が問われる" },
  { id: "hp",      label: "HP・サービスサイト",       icon: "🌐", note: "医療機関HPも2018年から広告規制の対象" },
  { id: "banner",  label: "バナー・リスティング広告",  icon: "🎯", note: "短文でも最大級・保証表現に注意" },
  { id: "sns",     label: "SNS投稿",                  icon: "📱", note: "ステマ規制（PR明示）・体験談の扱いが最重要" },
  { id: "article", label: "記事・コラム（監修含む）",  icon: "📝", note: "記事広告・ネイティブアドは広告に該当" },
  { id: "video",   label: "動画（YouTube・広告）",     icon: "🎬", note: "ビフォーアフターの動的表現に注意" },
  { id: "print",   label: "チラシ・DM（紙）",          icon: "📮", note: "配布物は誘引性あり＝広告" },
  { id: "review",  label: "口コミ・体験談",            icon: "💬", note: "医療は原則NG。サクラ・ステマは景表法違反" },
  { id: "package", label: "商品パッケージ・ラベル",    icon: "📦", note: "法定表示義務＋景表法" },
  { id: "mail",    label: "メルマガ・LINE配信",        icon: "✉️", note: "継続的勧誘。特商法・薬機法" },
];

export function industryById(id) {
  return INDUSTRIES.find((i) => i.id === id) || null;
}
export function mediaById(id) {
  return MEDIA.find((m) => m.id === id) || null;
}

// 法令ノードが業種×媒体に適用されるか
export function lawApplies(law, industryId, subId, mediaId) {
  const indOk =
    !law.industries || law.industries.length === 0 || law.industries.includes(industryId);
  if (!indOk) return false;
  if (law.industries_sub && law.industries_sub.length > 0 && subId) {
    if (!law.industries_sub.includes(subId)) return false;
  }
  const medOk = !law.media || law.media.length === 0 || !mediaId || law.media.includes(mediaId);
  return medOk;
}

// ルール（rulebook_v2）が業種に適用されるか
export function ruleApplies(rule, industryId, subId) {
  const inds = rule.industries || [];
  if (inds.length === 0) return true; // 横断ルール
  if (!inds.includes(industryId)) return false;
  const subs = rule.industries_sub || [];
  if (subs.length > 0 && subId) return subs.includes(subId);
  return true;
}
