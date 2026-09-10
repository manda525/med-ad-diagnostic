// 動画テロップの検収を機械的に行う。
//
// 動画は静止画と違い「何を書いたか」だけでなく「何秒間、どの順で出したか」が問われる。
// 消費者庁の打消し表示に関する実態調査は、動画広告で打消し表示の表示時間が短いと
// 一般消費者が読み終えられず景表法上問題となるおそれがある、と整理している（L-VIDEO-DISCLAIM）。
// 目視の流し見では秒数の不足を検出できないため、編集者から受け取るテロップ表を機械で当てる。
//
// 重要：ここに置く数値は「読み切れるか」を判断するための実務上の設計値であって、
// 行政が定めた基準値ではない。案件や視聴環境に応じて調整する前提で、既定値を明示しておく。

/** role ごとの既定しきい値。sec は最低表示秒数、rate は上限の文字数/秒。 */
export const DEFAULT_THRESHOLDS = {
  body:       { rate: 6.0, sec: 1.5 },  // 通常テロップ
  legal:      { rate: 5.0, sec: 4.0 },  // 法定明示・限定解除の併記事項
  disclaimer: { rate: 5.0, sec: 4.0 },  // 打消し表示（注記・個人差の但し書き）
  pr:         { rate: 6.0, sec: 2.0 },  // ステマ規制のPR表記
};

/**
 * 既定の禁止語。manifest.forbidden で上書きできる。
 * 「要記入」「TBD」は、条件が埋まらないまま公開されるのを止めるための番人。
 */
export const DEFAULT_FORBIDDEN = ["要記入", "TBD", "仮テキスト", "ダミー"];

/** PR表記は冒頭この秒数までに出す（見る前に広告と分かる状態にする） */
export const PR_HEAD_LIMIT_SEC = 3.0;

const ROLES = Object.keys(DEFAULT_THRESHOLDS);

/** 改行と空白を除いた実文字数。読了負荷は見える字数で決まる。 */
export function visibleLength(text) {
  return String(text || "").replace(/\s/g, "").length;
}

export function readingRate(text, seconds) {
  if (!(seconds > 0)) return Infinity;
  return visibleLength(text) / seconds;
}

/** 2つの区間が重なる秒数 */
export function overlapSec(a, b) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

function finding(level, code, message, telop) {
  return { level, code, message, telop: telop ? (telop.id ?? telop.text?.slice(0, 20)) : null };
}

/**
 * テロップ表を検収する。
 * manifest: { duration?, telops: [{ id?, start, end, text, role?, anchors? }] }
 *   role     省略時は "body"
 *   anchors  打消し表示が打ち消す対象テロップの id 配列。時間の重なりを確認する。
 */
export function auditTelops(manifest, opts = {}) {
  const th = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds || {}) };
  const telops = Array.isArray(manifest?.telops) ? manifest.telops : [];
  const out = [];

  if (telops.length === 0) {
    out.push(finding("NG", "EMPTY", "テロップが1件も無い。検収の対象がない"));
    return { findings: out, ...summarize(out) };
  }

  const byId = new Map(telops.filter((t) => t.id != null).map((t) => [t.id, t]));

  for (const t of telops) {
    const role = t.role || "body";
    if (!ROLES.includes(role)) {
      out.push(finding("NG", "ROLE_UNKNOWN", `role「${role}」は未定義。${ROLES.join("/")} のいずれかにする`, t));
      continue;
    }
    const dur = Number(t.end) - Number(t.start);

    if (!(Number(t.start) >= 0) || !(dur > 0)) {
      out.push(finding("NG", "TIME_INVALID", `開始 ${t.start} / 終了 ${t.end} が不正。start<end かつ 0以上にする`, t));
      continue;
    }
    if (manifest.duration != null && Number(t.end) > Number(manifest.duration) + 1e-6) {
      out.push(finding("NG", "TIME_OVERRUN", `終了 ${t.end}s が動画尺 ${manifest.duration}s を超えている`, t));
    }

    const limit = th[role];
    const rate = readingRate(t.text, dur);
    if (rate > limit.rate) {
      const need = (visibleLength(t.text) / limit.rate);
      out.push(finding("NG", "RATE_OVER",
        `${rate.toFixed(1)}字/秒（上限${limit.rate}）。${visibleLength(t.text)}字なら最低 ${need.toFixed(1)}s 必要、実際は ${dur.toFixed(1)}s`, t));
    }
    if (dur < limit.sec) {
      out.push(finding("NG", "TOO_SHORT",
        `表示 ${dur.toFixed(1)}s は role=${role} の最低 ${limit.sec}s を下回る`, t));
    }

    // 打消し表示は、打ち消す対象と同時に見えていなければ結びつけて認識されない
    if (role === "disclaimer") {
      const anchors = Array.isArray(t.anchors) ? t.anchors : [];
      if (anchors.length === 0) {
        out.push(finding("WARN", "DISCLAIMER_NO_ANCHOR",
          "打ち消す対象（anchors）が指定されていない。強調表示との対応を明示する", t));
      }
      for (const aid of anchors) {
        const a = byId.get(aid);
        if (!a) {
          out.push(finding("NG", "ANCHOR_MISSING", `anchors の「${aid}」に該当するテロップが無い`, t));
          continue;
        }
        const ov = overlapSec(t, a);
        if (ov <= 0) {
          out.push(finding("NG", "DISCLAIMER_NO_OVERLAP",
            `打消し表示が「${aid}」と同時に表示されていない（別カット）。同一画面に出す`, t));
        } else if (ov < limit.sec) {
          out.push(finding("NG", "DISCLAIMER_SHORT_OVERLAP",
            `「${aid}」との同時表示が ${ov.toFixed(1)}s しかない（最低 ${limit.sec}s）`, t));
        }
      }
    }
  }

  // ステマ規制：PR表記は冒頭で出す
  const prs = telops.filter((t) => t.role === "pr");
  if (manifest.requirePr !== false) {
    if (prs.length === 0) {
      out.push(finding(manifest.requirePr ? "NG" : "WARN", "PR_MISSING",
        "PR表記（role=pr）が無い。広告主の依頼による発信ならステマ規制の対象になる"));
    } else {
      const first = Math.min(...prs.map((t) => Number(t.start)));
      if (first > PR_HEAD_LIMIT_SEC) {
        out.push(finding("NG", "PR_LATE",
          `PR表記の初出が ${first.toFixed(1)}s。冒頭 ${PR_HEAD_LIMIT_SEC}s 以内に出す`));
      }
    }
  }

  // 必須項目（求人なら職安法の明示事項、医療広告なら限定解除の併記事項）
  const required = Array.isArray(manifest.required) ? manifest.required : [];
  const allText = telops.map((t) => t.text || "").join("\n");
  for (const key of required) {
    if (!allText.includes(key)) {
      out.push(finding("NG", "REQUIRED_MISSING", `必須項目「${key}」がテロップに見当たらない`));
    }
  }

  // 禁止語。確定稿に残った仮テキスト、および案件固有のNG表現を弾く。
  // 求人なら年齢・性別を絞る表現（労働施策総合推進法9条・均等法5条）がここに入る。
  const forbidden = Array.isArray(manifest.forbidden) ? manifest.forbidden : DEFAULT_FORBIDDEN;
  for (const t of telops) {
    for (const word of forbidden) {
      if (String(t.text || "").includes(word)) {
        out.push(finding("NG", "FORBIDDEN_WORD", `禁止語「${word}」が残っている`, t));
      }
    }
  }

  return { findings: out, ...summarize(out) };
}

function summarize(findings) {
  const ng = findings.filter((f) => f.level === "NG").length;
  const warn = findings.filter((f) => f.level === "WARN").length;
  return { ng, warn, verdict: ng > 0 ? "要修正" : warn > 0 ? "確認のうえ判断" : "検収OK" };
}

export function formatReport(manifest, result) {
  const lines = [];
  lines.push(`■ 動画テロップ検収レポート`);
  lines.push(`案件：${manifest.title || "(無題)"}`);
  if (manifest.duration != null) lines.push(`尺：${manifest.duration}s ／ テロップ ${manifest.telops?.length ?? 0}件`);
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("  指摘なし");
  } else {
    for (const f of result.findings) {
      const who = f.telop != null ? `[${f.telop}] ` : "";
      lines.push(`  ${f.level === "NG" ? "NG  " : "WARN"} ${who}${f.message}`);
    }
  }
  lines.push("");
  lines.push(`NG ${result.ng}件 / WARN ${result.warn}件`);
  lines.push(`最終判定（掲載可/要修正/不可）：${result.verdict}　※一次チェック。最終可否はまさが確認`);
  return lines.join("\n");
}
