// 広告文から業種・媒体を推定する。
//
// 目的は「当てること」ではなく「ユーザーに18択を突きつけないこと」。
// 外した場合はユーザーが手で直せる前提なので、迷ったら最頻値へ倒す。
// AIは使わない（入力のたびに走るため。コストゼロ・同期実行で完結させる）。
//
// 業種Fは推定対象外。Fは受託先業種の追加選択が必須で、広告文からは受託先を
// 判定できないため、自動で選ぶと必須項目が空のまま実行できない状態になる。

const IND_RULES = [
  {
    id: "G",
    re: /犬|猫|ペット|愛犬|愛猫|ワンちゃん|ネコちゃん|ドッグ|キャット|獣医|動物病院/,
    subs: [
      [/ドッグフード|キャットフード|総合栄養食|給餌|フード/, "petfood"],
      [/サプリ|栄養補助|関節ケア|毛玉/, "petsupp"],
      [/動物病院|獣医師の診療|去勢|避妊|ワクチン/, "vet"],
    ],
    fallbackSub: "petgoods",
  },
  {
    id: "A",
    re: /クリニック|当院|医院|外来|診療|美容外科|美容皮膚科|皮膚科|内科|歯科|医師が|院長/,
    subs: [
      [/歯|インプラント|矯正|ホワイトニング|口腔/, "dental"],
      [/心療|精神|うつ|メンタル|カウンセリング/, "mental"],
      [/美容外科|美容皮膚科|ボトックス|ヒアルロン酸|脂肪吸引|二重|糸リフト/, "biyou"],
    ],
    fallbackSub: "hospital",
  },
  {
    id: "A2",
    re: /調剤|薬局|ドラッグストア|処方箋|訪問看護|助産院|助産師/,
    subs: [
      [/助産/, "midwife"],
      [/訪問看護|在宅/, "houkan"],
    ],
    fallbackSub: "pharmacy",
  },
  {
    id: "B",
    re: /整骨院|接骨院|柔道整復|鍼灸|はり師|きゅう師|あん摩|マッサージ指圧|療養費/,
    subs: [[/鍼|灸|あん摩|指圧/, "ahaki"]],
    fallbackSub: "judo",
  },
  {
    id: "C",
    re: /整体|カイロプラクティック|リラクゼーション|もみほぐし|骨盤矯正/,
    subs: [
      [/カイロ/, "chiro"],
      [/リラクゼーション|もみほぐし|リフレ/, "relax"],
    ],
    fallbackSub: "seitai",
  },
  {
    id: "D",
    re: /エステ|脱毛|痩身サロン|フェイシャル|パーソナルトレーニング|ジム|ヨガ|ピラティス|サロン/,
    subs: [
      [/脱毛|痩身/, "datsumo"],
      [/ジム|トレーニング|加圧/, "gym"],
      [/ヨガ|ピラティス/, "yoga"],
    ],
    fallbackSub: "esthe",
  },
  {
    id: "E",
    re: /サプリ|健康食品|機能性表示|栄養機能|化粧品|美容液|化粧水|クリーム|シャンプー|医薬部外品|薬用|配合|通販|お取り寄せ|飲むだけ|摂取|粒|カプセル|ドリンク/,
    subs: [
      [/化粧品|化粧水|美容液|クリーム|スキンケア|シャンプー|コスメ|洗顔|日焼け止め|ファンデ/, "cosme"],
      [/機能性表示|届出番号|届出表示/, "func"],
      [/医薬部外品|薬用/, "quasi"],
      [/美顔器|EMS|ドライヤー|機器|デバイス/, "device"],
    ],
    fallbackSub: "supp",
  },
];

// 媒体は「体裁」で決まる。順序が重要（パッケージ・SNS・体験談を記事より先に見る）。
const MEDIA_RULES = [
  [/内容量|原材料名|保存方法|賞味期限|消費期限|製造者|販売者|栄養成分表示|1日あたりの摂取目安/, "package"],
  [/#|＃|ハッシュタグ|ストーリーズ|フォロー|いいね|リポスト|PR案件/, "sns"],
  [/使ってみました|体験談|口コミ|レビュー|愛用者の声|お客様の声|個人の感想/, "review"],
  [/配信停止|メルマガ|LINE登録|友だち追加|一斉配信/, "mail"],
  [/チャンネル登録|再生|動画|ナレーション|字幕/, "video"],
  [/チラシ|折込|ポスティング|DM|ハガキ/, "print"],
  [/診療時間|アクセス|会社概要|お問い合わせフォーム|営業時間|院長挨拶/, "hp"],
  [/この記事|見出し|参考文献|とは？|解説します|監修者/, "article"],
];

/**
 * @param {string} text 広告文
 * @returns {{industry:string, sub:string|null, media:string, guessed:boolean}}
 *   guessed=false は「手がかりが無く既定値に倒した」の意。呼び出し側で
 *   「推定しました」と言い切らないための旗。
 */
export function inferContext(text) {
  const t = String(text || "");
  if (t.trim().length < 8) {
    return { industry: null, sub: null, media: null, guessed: false };
  }

  let industry = null;
  let sub = null;
  for (const r of IND_RULES) {
    if (r.re.test(t)) {
      industry = r.id;
      sub = r.fallbackSub;
      for (const [re, id] of r.subs) {
        if (re.test(t)) { sub = id; break; }
      }
      break;
    }
  }

  let media = null;
  for (const [re, id] of MEDIA_RULES) {
    if (re.test(t)) { media = id; break; }
  }
  // 手がかりが無ければLP。実測でLPが最多。
  // バナーはコピーが極端に短いので、20字以下のときだけ。
  // （閾値40では「毎日飲むだけで内臓脂肪が燃焼し…」のような通常の広告文まで
  //   バナー判定になった。2026-08-31 実測で修正）
  if (!media) media = t.length <= 20 ? "banner" : "lp";

  const guessed = industry !== null;
  // 業種が取れなくても止めない。物販・ECはルールが752件で最も厚く、
  // 外した場合の取りこぼしが最小になる。
  if (!industry) { industry = "E"; sub = null; }

  return { industry, sub, media, guessed };
}
