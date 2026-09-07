// 「処方でもらうか、市販薬で買うか」の自己負担比較（概算）
//
// 純粋関数のみ。点数は編集可能な入力として受け取り、既定値は DEFAULT_POINTS に置く。
// 既定値の確認状況（2026-09-07）
// - 再診料 76点・物価対応料 2点・外来管理加算 52点：令和8年6月改定の値（二次情報で確認）
// - 処方箋料 60点・調剤基本料1 45点・薬剤調剤料（内服7日分以下）24点・服薬管理指導料 45点：令和6年度の値。令和8年度点数表での再確認が必要
// - 調剤管理料 10点：令和8年6月改定で日数区分が廃止され10点に統一と報じられている（二次情報）
// 一部負担金は 10円未満を四捨五入。薬剤料の点数化は「五捨五超入」（10円で1点、端数0.5以下は切り捨て）。

export const DEFAULT_POINTS = {
  saishin: 76, // 再診料
  bukka: 2, // 物価対応料
  gairai: 52, // 外来管理加算（処置・検査なしの内科系再診）
  shohosen: 60, // 処方箋料
  kihon: 45, // 調剤基本料1
  chozai: 24, // 薬剤調剤料（内服薬・7日分以下・1剤）
  kanri: 10, // 調剤管理料
  shido: 45, // 服薬管理指導料
};

export const POINT_LABELS = {
  saishin: { label: "再診料", verified: true },
  bukka: { label: "物価対応料", verified: true },
  gairai: { label: "外来管理加算", verified: true },
  shohosen: { label: "処方箋料", verified: false },
  kihon: { label: "調剤基本料", verified: false },
  chozai: { label: "薬剤調剤料（1剤）", verified: false },
  kanri: { label: "調剤管理料", verified: false },
  shido: { label: "服薬管理指導料", verified: false },
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
