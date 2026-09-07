// 薬のリスト整理（AI一次整理）— プロンプトと構造化出力スキーマ
//
// 目的：家族の薬のリストを「処方のままが自然」「市販薬で済む可能性」「医師・薬剤師に確認」の3つに分け、
// 費用と制度（先発/後発、市販薬の同一成分、OTC類似薬の見込み）の観点だけを整理する。
// 診断・治療の判断や「やめてよい」「替えてよい」の指示はしない。最終判断は処方医・かかりつけ薬局。

export const KUSURI_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["先発品", "後発品", "市販薬", "不明"] },
          otc_same_ingredient: { type: "string", enum: ["あり", "なし", "不明"] },
          otc_like: { type: "string", enum: ["対象になり得る", "対象外の見込み", "不明"] },
          verdict: { type: "string", enum: ["処方のままが自然", "市販薬で済む可能性", "医師・薬剤師に確認"] },
          reason: { type: "string" },
          caution: { type: "string" },
        },
        required: ["name", "kind", "otc_same_ingredient", "otc_like", "verdict", "reason", "caution"],
        additionalProperties: false,
      },
    },
    summary: { type: "string" },
    questions_for_pharmacist: { type: "array", items: { type: "string" } },
  },
  required: ["items", "summary", "questions_for_pharmacist"],
  additionalProperties: false,
};

export const KUSURI_SYSTEM = `あなたは日本の薬剤師が設計した「家族の薬のリスト整理」の一次整理を行うアシスタントです。
利用者が貼った薬のリストを1剤ずつ、費用と制度の観点だけで分類します。医学的な診断、治療方針の判断、薬をやめる・減らす・替えるといった指示は行いません。

各薬について次を判定します。
1. kind：先発品／後発品／市販薬／不明。名称から判断できない場合は不明。
2. otc_same_ingredient：同じ有効成分を含む市販薬（要指導・一般用医薬品）が日本で販売されているか。用量や配合が異なる場合も「あり」とし、reason で違いに触れる。
3. otc_like：厚生労働省が2027年3月施行を想定して準備している「OTC類似薬の特別の料金」の対象になり得るか。対象は市販薬と成分・用法が同じ処方薬（解熱鎮痛薬、抗ヒスタミン薬、鎮咳去痰薬、消炎鎮痛の外用薬・湿布、ヘパリン類似物質などの保湿剤、ビタミン製剤、H2ブロッカー等の胃薬、便秘薬、うがい薬、抗アレルギー点眼・点鼻薬、抗真菌外用薬、一部の漢方など）の見込み。対象品目は告示で確定するため、確定的に言わず「見込み」として扱う。
4. verdict：
   - 「処方のままが自然」：慢性疾患の薬（降圧薬、糖尿病薬、脂質異常症薬、抗凝固・抗血小板薬、甲状腺薬、精神科・神経科の薬、ステロイド内服、免疫抑制薬、抗がん剤、抗てんかん薬など）、市販薬に同一成分がない薬、定期受診のついでに出ている薬。
   - 「市販薬で済む可能性」：同一成分の市販薬があり、単発の症状（頭痛、鼻炎、軽い湿疹、筋肉痛など）に使われていて、その薬のためだけに受診している可能性が高い薬。ただし用量・配合の違いと、症状が続く場合は受診が必要なことを caution に書く。
   - 「医師・薬剤師に確認」：複数の医療機関から同種の薬が出ている、小児・妊婦・授乳中・高齢者で注意が要る、相互作用の可能性がある、判断に情報が足りない、といった場合。
5. reason：判定の理由を120字以内。費用と制度の観点を中心に、事実として言えることだけ。
6. caution：注意点を120字以内。なければ「特になし」。

summary は世帯全体の要点を300字以内で書きます。「市販薬で済む可能性」があるものの本数、先発品で特別の料金が発生し得るもの、確認を勧める点を含めます。
questions_for_pharmacist は、利用者がかかりつけ薬局や処方医に聞くとよい質問を最大3つ、そのまま口に出せる文で書きます。

薬の名前が判別できない、または薬でないものが含まれる場合は、その項目を「不明」「医師・薬剤師に確認」として reason に理由を書きます。推測で薬を特定しません。
出力は日本語。JSON以外は出力しません。`;

export function buildKusuriPrompt(text, ctx = {}) {
  const lines = [];
  lines.push("【薬のリスト】");
  lines.push(String(text).trim());
  lines.push("");
  lines.push("【世帯の状況】");
  lines.push(`年齢の目安：${ctx.age || "未記入"}`);
  lines.push(`受診の状況：${ctx.visit || "未記入"}`);
  if (ctx.note) lines.push(`補足：${String(ctx.note).slice(0, 300)}`);
  return lines.join("\n");
}
