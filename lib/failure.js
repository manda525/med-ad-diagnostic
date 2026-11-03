// 診断に失敗したときの、利用者向けの分類。
//
// 診断API（pages/api/diagnose.js）は、AI を呼ぶ前に無料枠を予約し、失敗した経路では
// すべて予約を戻す。上限（402）・集中（429）・設定不備（503）は予約より前に返る。
// そのため、サーバーが失敗を返したときは、利用回数は減っていない。
// 通信そのものが途切れたときだけは、サーバー側でどこまで進んだか分からないので断定しない。

const MAX_DETAIL = 120;

export function classifyFailure({ status, message, network } = {}) {
  if (network) {
    return {
      kind: "network",
      label: "通信できませんでした",
      hint: "電波やネットワークを確認して、もう一度お試しください。回数が減っていないかは、画面右上の残り回数で確認できます。",
      notConsumed: false,
    };
  }
  switch (Number(status)) {
    case 402:
      return {
        kind: "limit",
        label: "本日の無料診断を使い切りました",
        hint: "24時間後にまた使えます。急ぎの原稿は、薬剤師の監修で対応します。",
        notConsumed: true,
      };
    case 429:
      return {
        kind: "busy",
        label: "アクセスが集中しています",
        hint: "しばらく置いてから、もう一度お試しください。",
        notConsumed: true,
      };
    case 422:
      return {
        kind: "refused",
        label: "AIの自動診断の対象外でした",
        hint: "この内容は、監修相談をご利用ください。",
        notConsumed: true,
      };
    case 504:
      return {
        kind: "timeout",
        label: "時間がかかりすぎて中断しました",
        hint: "広告文を短く分けるか、しばらく置いてからお試しください。",
        notConsumed: true,
      };
    case 502:
      return {
        kind: "parse",
        label: "AIの応答を読み取れませんでした",
        hint: "もう一度お試しください。繰り返す場合は、お問い合わせください。",
        notConsumed: true,
      };
    case 400:
      return {
        kind: "input",
        label: "入力を確認してください",
        hint: message || "広告文を確認して、もう一度お試しください。",
        notConsumed: true,
      };
    case 503:
      return {
        kind: "config",
        label: "ただいま診断をお休みしています",
        hint: "サーバー側の準備が整っていません。しばらくしてからお試しください。",
        notConsumed: true,
      };
    default:
      return {
        kind: "system",
        label: "システム側の問題で診断できませんでした",
        hint: "もう一度お試しください。繰り返す場合は、お問い合わせください。",
        detail: message ? String(message).slice(0, MAX_DETAIL) : "",
        notConsumed: true,
      };
  }
}

// 履歴に残す失敗の種類。「始められなかった」もの（上限・入力）は診断の失敗ではないので残さない。
export const RECORDED_FAILURE_KINDS = new Set(["busy", "refused", "timeout", "parse", "config", "system", "network"]);
