// 世帯の医療費計算（段階0）
//
// 純粋関数のみ。ブラウザにもNodeにも依存しない。
// 税額はすべて概算で、最終的な申告は国税庁の確定申告書等作成コーナー・税理士へ。
//
// 根拠（確認日 2026-09-07）
// - 医療費控除：国税庁 No.1120。(支払った医療費 − 保険金等) − min(10万円, 総所得金額等×5%)、上限200万円
// - セルフメディケーション税制：国税庁。対象医薬品の購入額 − 12,000円、上限88,000円。医療費控除と選択制
// - 長期収載品の特別の料金：医療費控除の対象だが、マイナポータル連携の医療費通知には反映されない（厚労省疑義解釈）

export const CATEGORIES = [
  {
    key: "insured",
    label: "保険診療の窓口負担（病院・薬局）",
    notice: true,
    deductible: true,
    hint: "マイナポータルの医療費通知に載る分。確定申告では自動取得できる",
  },
  {
    key: "special_brand",
    label: "長期収載品の特別の料金（先発品を希望したとき）",
    notice: false,
    deductible: true,
    hint: "医療費控除の対象。医療費通知には載らないので領収書を保管する",
  },
  {
    key: "otc",
    label: "市販薬（OTC）",
    notice: false,
    deductible: "treatment",
    hint: "治療目的なら医療費控除の対象。セルフメディケーション税制の対象品はパッケージのマークで確認",
  },
  {
    key: "private",
    label: "自由診療（歯科・眼科など、治療目的）",
    notice: false,
    deductible: true,
    hint: "治療目的の自由診療は医療費控除の対象。美容目的は対象外",
  },
  {
    key: "transport",
    label: "通院の交通費（電車・バス）",
    notice: false,
    deductible: true,
    hint: "公共交通機関の運賃は対象。自家用車のガソリン代・駐車場代は対象外",
  },
  {
    key: "excluded",
    label: "控除対象外（眼鏡・サプリ・健診・美容・ペット）",
    notice: false,
    deductible: false,
    hint: "家計としては医療支出だが、医療費控除の対象にならないもの",
  },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

export const INCOME_TAX_RATES = [
  { rate: 0.05, label: "5%（課税所得 195万円以下）" },
  { rate: 0.1, label: "10%（195万円超〜330万円）" },
  { rate: 0.2, label: "20%（330万円超〜695万円）" },
  { rate: 0.23, label: "23%（695万円超〜900万円）" },
  { rate: 0.33, label: "33%（900万円超〜1,800万円）" },
];

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export function isDeductible(entry) {
  const cat = CATEGORY_MAP[entry.category];
  if (!cat) return false;
  if (cat.deductible === "treatment") return entry.treatment !== false;
  return cat.deductible === true;
}

export function isSelfMed(entry) {
  return entry.category === "otc" && entry.selfmedMark === true;
}

// 支出一覧を集計する
export function summarize(entries) {
  const byMember = {};
  const byCategory = {};
  let total = 0;
  let inNotice = 0;
  let notInNotice = 0;
  let deductible = 0;
  let deductibleNotInNotice = 0;
  let selfMed = 0;

  for (const e of entries) {
    const amount = toInt(e.amount);
    if (!amount) continue;
    const cat = CATEGORY_MAP[e.category];
    if (!cat) continue;

    total += amount;
    byMember[e.memberId] = (byMember[e.memberId] || 0) + amount;
    byCategory[e.category] = (byCategory[e.category] || 0) + amount;

    if (cat.notice) inNotice += amount;
    else notInNotice += amount;

    if (isDeductible(e)) {
      deductible += amount;
      if (!cat.notice) deductibleNotInNotice += amount;
    }
    if (isSelfMed(e)) selfMed += amount;
  }

  return {
    total,
    inNotice,
    notInNotice,
    deductible,
    deductibleNotInNotice,
    selfMed,
    byMember,
    byCategory,
  };
}

// 医療費控除の控除額
export function medicalDeduction({ deductible, reimbursed = 0, totalIncome }) {
  const income = toInt(totalIncome);
  const threshold = income > 0 ? Math.min(100000, Math.floor(income * 0.05)) : 100000;
  const base = toInt(deductible) - toInt(reimbursed) - threshold;
  return {
    threshold,
    amount: Math.max(0, Math.min(2000000, base)),
  };
}

// セルフメディケーション税制の控除額
export function selfMedDeduction({ selfMed, reimbursed = 0, qualifies = true }) {
  if (!qualifies) return { amount: 0, reason: "一定の取組（健診・予防接種など）の要件を満たしていない" };
  const base = toInt(selfMed) - toInt(reimbursed) - 12000;
  return { amount: Math.max(0, Math.min(88000, base)) };
}

// 控除額から戻る税額の概算（所得税＋復興特別所得税、住民税10%）
export function estimateTaxSaving(deduction, incomeTaxRate) {
  const d = toInt(deduction);
  const rate = Number(incomeTaxRate) || 0;
  const incomeTax = Math.floor((Math.round(d * rate) * 1021) / 1000);
  const residentTax = Math.floor(d * 0.1);
  return { incomeTax, residentTax, total: incomeTax + residentTax };
}

// 医療費控除とセルフメディケーション税制のどちらが有利か
export function compareDeductions({ summary, reimbursed, totalIncome, incomeTaxRate, selfMedQualifies }) {
  const medical = medicalDeduction({ deductible: summary.deductible, reimbursed, totalIncome });
  const selfMed = selfMedDeduction({ selfMed: summary.selfMed, qualifies: selfMedQualifies });
  const medicalSaving = estimateTaxSaving(medical.amount, incomeTaxRate);
  const selfMedSaving = estimateTaxSaving(selfMed.amount, incomeTaxRate);

  let better = "none";
  if (medical.amount > 0 || selfMed.amount > 0) {
    better = medicalSaving.total >= selfMedSaving.total ? "medical" : "selfMed";
  }
  return { medical, selfMed, medicalSaving, selfMedSaving, better };
}

// 長期収載品の特別の料金（概算）
// 2024-10-01〜2026-05-31：価格差の1/4、2026-06-01〜：価格差の1/2。消費税10%が上乗せされる。
// 実際の額は点数への換算と端数処理で数円ずれる。
export function specialFee({ brandPrice, genericPrice, quantity = 1, ratio = 0.5, taxRate = 0.1 }) {
  const brand = Number(brandPrice);
  const generic = Number(genericPrice);
  const qty = Number(quantity) || 0;
  if (!(brand > 0) || !(generic > 0) || !(qty > 0)) return { fee: 0, diffPerUnit: 0 };
  const diff = brand - generic;
  if (!(diff > 0)) return { fee: 0, diffPerUnit: 0 };
  const fee = Math.round(diff * qty * ratio * (1 + taxRate));
  return { fee, diffPerUnit: diff };
}
