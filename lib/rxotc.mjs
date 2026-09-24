// 「処方でもらうか、市販薬で買うか」の自己負担比較（概算）
//
// 純粋関数のみ。点数は編集可能な入力として受け取り、既定値は DEFAULT_POINTS に置く。
// 既定値の確認状況（2026-09-24、令和8年6月1日施行の点数を一次資料で確認）
// 一次資料：日本薬剤師会「令和８年度調剤改定項目 新旧対照表（調剤報酬／医科関係部分）」（2026-04-02）
//           同「調剤報酬点数表一覧（R8.6.1〜）」（2026-05-28）
//           https://www.nichiyaku.or.jp/yakuzaishi/pharmacy-info/document/r08
// - 再診料 76点（令和6年度 75点）・物価対応料（再診時）2点（新設）：新旧対照表（医科）で確認
// - 外来管理加算 52点：令和8年度の改定項目に含まれず据え置き
// - 処方箋料（1・2以外）60点：新旧対照表（医科）F400 で確認（据え置き）
// - 調剤基本料1 47点（令和6年度 45点）：新旧対照表（調剤）で確認
// - 薬剤調製料（内服薬・1剤）24点：据え置き。名称は「薬剤調剤料」ではなく「薬剤調製料」
// - 調剤管理料（内服薬・27日分以下）10点（令和6年度は7日分以下 4点）。28日分以上は 60点
// - 服薬管理指導料 59点（原則3か月以内に再度処方箋を持参した患者以外）。3か月以内の再来は 45点
// 一部負担金は 10円未満を四捨五入。薬剤料の点数化は「五捨五超入」（10円で1点、端数0.5以下は切り捨て）。

export const DEFAULT_POINTS = {
  saishin: 76, // 再診料
  bukka: 2, // 物価対応料
  gairai: 52, // 外来管理加算（処置・検査なしの内科系再診）
  shohosen: 60, // 処方箋料
  kihon: 47, // 調剤基本料1
  chozai: 24, // 薬剤調製料（内服薬・1剤）
  kanri: 10, // 調剤管理料（内服薬・27日分以下）
  shido: 59, // 服薬管理指導料（3か月以内の再来でない場合。再来なら45点）
};

export const POINT_LABELS = {
  saishin: { label: "再診料", verified: true },
  bukka: { label: "物価対応料", verified: true },
  gairai: { label: "外来管理加算", verified: true },
  shohosen: { label: "処方箋料", verified: true },
  kihon: { label: "調剤基本料1", verified: true },
  chozai: { label: "薬剤調製料（内服薬・1剤）", verified: true },
  kanri: { label: "調剤管理料（27日分以下）", verified: true },
  shido: { label: "服薬管理指導料（3か月以内の再来は45点）", verified: true },
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// 薬剤料の点数化（五捨五超入）
export function drugPoints(price, quantity) {
  const yen = num(price) * num(quantity);
  if (!yen) return 0;
  const x = yen / 10;
  const floor = Math.floor(x);
  const frac = x - floor;
  return frac > 0.5 ? floor + 1 : floor;
}

// 一部負担金（10円未満四捨五入）
export function copay(points, ratio) {
  const yen = num(points) * 10 * num(ratio);
  return Math.round(yen / 10) * 10;
}

/**
 * 処方でもらう場合の自己負担を概算する
 * @param {object} p
 * @param {number} p.price       薬価（1錠・1包・1本あたり、円）
 * @param {number} p.quantity    数量
 * @param {number} p.ratio       負担割合（0, 0.1, 0.2, 0.3）
 * @param {boolean} p.standalone この薬のためだけに受診する（true）／定期受診のついで（false）
 * @param {boolean} p.otcLike    OTC類似薬の特別の料金（薬剤費の1/4）を適用する
 * @param {object}  p.points     点数（DEFAULT_POINTS を上書き）
 */
export function prescriptionCost(p) {
  const pts = { ...DEFAULT_POINTS, ...(p.points || {}) };
  const ratio = Number(p.ratio) || 0;
  const drug = drugPoints(p.price, p.quantity);

  const clinic = p.standalone ? pts.saishin + pts.bukka + pts.gairai + pts.shohosen : 0;
  const pharmacyTech = p.standalone ? pts.kihon + pts.chozai + pts.kanri + pts.shido : pts.chozai;

  const clinicCopay = copay(clinic, ratio);
  const pharmacyCopay = copay(pharmacyTech + drug, ratio);

  const drugYen = num(p.price) * num(p.quantity);
  const specialFee = p.otcLike ? Math.round(drugYen / 4) : 0;

  return {
    points: { clinic, pharmacyTech, drug, total: clinic + pharmacyTech + drug },
    clinicCopay,
    pharmacyCopay,
    specialFee,
    drugYen: Math.round(drugYen),
    total: clinicCopay + pharmacyCopay + specialFee,
  };
}

/**
 * 処方とOTCを比べる
 * @param {object} p prescriptionCost の引数に加えて otcPrice, hours, hourlyValue
 */
export function compareRxOtc(p) {
  const rx = prescriptionCost(p);
  const otc = Math.round(num(p.otcPrice));
  const timeCost = Math.round(num(p.hours) * num(p.hourlyValue));
  const rxWithTime = rx.total + timeCost;

  let cheaper = "even";
  if (rx.total < otc) cheaper = "rx";
  else if (otc < rx.total) cheaper = "otc";

  let cheaperWithTime = "even";
  if (rxWithTime < otc) cheaperWithTime = "rx";
  else if (otc < rxWithTime) cheaperWithTime = "otc";

  return {
    rx,
    otc,
    timeCost,
    rxWithTime,
    diff: Math.abs(rx.total - otc),
    diffWithTime: Math.abs(rxWithTime - otc),
    cheaper,
    cheaperWithTime,
  };
}
