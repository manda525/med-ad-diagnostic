// 動画AI（Veo等）で作ったカットを繋ぎ、テロップを載せるためのフィルタを組み立てる。
//
// テロップを動画AIに描かせないのは、日本語の文字が崩れるうえ、生成後に一字も直せないため。
// 文言はこちらで確定稿として持ち、書き出しの直前に焼き込む。焼き込む前に
// lib/videoAudit.js の検収を必ず通す（scripts/assemble-video.mjs が強制する）。
//
// ここは ffmpeg に渡す文字列を作るだけの純粋関数にしておき、tests で固定する。

export const OUT = { w: 1080, h: 1920, fps: 30 };

/** テロップの置き場所。main は下寄りの本文、note は上部の小さな注記（「映像はイメージです」等）。 */
export const POSITIONS = {
  main: { size: 64, y: "h*0.70" },
  note: { size: 34, y: "h*0.06" },
};

/**
 * 1行の見た目の幅を「全角1文字＝1」で数える。半角英数は約0.55文字分。
 * drawtext は折り返さないため、長い行は画面からはみ出す。
 */
export function lineWidthEm(line) {
  let w = 0;
  for (const ch of String(line)) w += /[\x20-\x7e]/.test(ch) ? 0.55 : 1;
  return w;
}

/** 一番長い行が画面幅の88%に収まる文字サイズ。既定サイズより大きくはしない。 */
export function fitFontSize(text, base, width = OUT.w, ratio = 0.88) {
  const longest = Math.max(1, ...String(text).split("\n").map(lineWidthEm));
  return Math.min(base, Math.floor((width * ratio) / longest));
}

/**
 * 同じ配置のテロップが同時に出ている箇所を返す。重なると文字が潰れて読めない。
 * position を指定し忘れた注記が本文と重なる事故を、書き出し前に止める。
 */
export function findPositionConflicts(telops) {
  const out = [];
  const list = (telops || []).map((t) => ({ ...t, position: t.position || "main" }));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.position !== b.position) continue;
      const ov = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (ov > 1e-6) out.push({ a: a.id ?? i, b: b.id ?? j, position: a.position, seconds: ov });
    }
  }
  return out;
}

/** フィルタグラフ内で式のカンマをエスケープする */
export function esc(expr) {
  return String(expr).replace(/,/g, "\\,");
}

/**
 * カットの並びから、各カットの開始秒を割り出す。
 * clips: [{ file, duration }]  → [{ ...clip, start, end }]
 */
export function layoutClips(clips) {
  let t = 0;
  return clips.map((c) => {
    const d = Number(c.duration);
    if (!(d > 0)) throw new Error(`カット ${c.file} の duration が不正: ${c.duration}`);
    const out = { ...c, start: t, end: t + d };
    t += d;
    return out;
  });
}

/**
 * テロップの見た目。
 *   box    … 黒い帯の上に白文字。どんな映像の上でも確実に読める（既定）
 *   shadow … 帯なしの白文字に縁と影。実写の上で柔らかく見える。下側を暗くする scrim と併用する
 */
export const STYLES = {
  box: (size) => [`box=1`, `boxcolor=black@0.45`, `boxborderw=${Math.round(size * 0.4)}`],
  shadow: (size) => [
    `borderw=${Math.max(2, Math.round(size * 0.04))}`, `bordercolor=black@0.45`,
    `shadowx=0`, `shadowy=${Math.max(2, Math.round(size * 0.05))}`, `shadowcolor=black@0.55`,
  ],
};

/**
 * テロップ1件分の drawtext。textfile を使うのは、本文の記号（：／など）を
 * フィルタ構文と衝突させないため。t.size で既定の文字サイズを上書きできる（冒頭のつかみ等）。
 */
export function telopFilter(t, textfile, font, fade = 0.3, style = "box") {
  const pos = POSITIONS[t.position || "main"] || POSITIONS.main;
  const size = fitFontSize(t.text, Number(t.size) || pos.size);
  const s = Number(t.start), e = Number(t.end);
  const alpha = `if(lt(t,${s + fade}),(t-${s})/${fade},if(gt(t,${e - fade}),(${e}-t)/${fade},1))`;
  return [
    `drawtext=fontfile=${font}`,
    `textfile=${textfile}`,
    `fontsize=${size}`,
    `fontcolor=white`,
    `line_spacing=${Math.round(size * 0.35)}`,
    ...(STYLES[style] || STYLES.box)(size),
    `text_align=C`,
    `x=(w-text_w)/2`,
    `y=${pos.y}`,
    `enable=${esc(`between(t,${s},${e})`)}`,
    `alpha=${esc(alpha)}`,
  ].join(":");
}

/** 1カットを縦型・30fps・指定秒数にそろえる（余白は黒で埋めず、中央を切り抜く） */
export function normalizeFilter(index, duration) {
  const { w, h, fps } = OUT;
  return `[${index}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
    `fps=${fps},setsar=1,trim=duration=${duration},setpts=PTS-STARTPTS[c${index}]`;
}

/**
 * 画面の下側をなだらかに暗くする（scrim）。実写の明るい部分に白文字が乗っても読めるようにする。
 * start〜1.0 の範囲で、下端に向かって最大 strength だけ輝度を落とす。
 */
export function scrimFilter(start = 0.55, strength = 0.5) {
  return `geq=lum='lum(X,Y)*(1-${strength}*clip((Y/H-${start})/${1 - start},0,1))':cb='cb(X,Y)':cr='cr(X,Y)'`;
}

/** カット群＋テロップ群から filter_complex を組み立てる */
export function buildFilterComplex(clips, telopFiles, font, opts = {}) {
  const laid = layoutClips(clips);
  const parts = laid.map((c, i) => normalizeFilter(i, c.duration));
  const concatIn = laid.map((_, i) => `[c${i}]`).join("");
  parts.push(`${concatIn}concat=n=${laid.length}:v=1:a=0[base]`);
  const draws = telopFiles.map(({ telop, file }) => telopFilter(telop, file, font, 0.3, opts.style));
  const pre = opts.scrim ? [scrimFilter()] : [];
  const chain = [...pre, ...draws];
  parts.push(chain.length ? `[base]${chain.join(",")}[v]` : `[base]null[v]`);
  return { filter: parts.join(";"), total: laid.length ? laid[laid.length - 1].end : 0, laid };
}
