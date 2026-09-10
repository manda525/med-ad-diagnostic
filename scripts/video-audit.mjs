#!/usr/bin/env node
// 動画テロップの検収CLI。
//
//   node scripts/video-audit.mjs <manifest.json> [--video path.mp4]
//
// manifest は編集者から受け取るテロップ表（docs/video_ops.md §4 の納品物）。
// --video を渡すと ffprobe で実尺を読み、manifest.duration と突き合わせる。
// NG が1件でもあれば終了コード 1。検収を通す条件をコマンドで固定できる。

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { auditTelops, formatReport } from "../lib/videoAudit.js";

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith("--"));
if (!manifestPath) {
  console.error("使い方: node scripts/video-audit.mjs <manifest.json> [--video path.mp4]");
  process.exit(2);
}
const videoIdx = args.indexOf("--video");
const videoPath = videoIdx >= 0 ? args[videoIdx + 1] : null;

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (videoPath) {
  let actual = null;
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath,
    ], { encoding: "utf8" });
    actual = Number(String(out).trim());
  } catch {
    console.error("警告: ffprobe を実行できず、実尺の照合を省略した");
  }
  if (actual != null && Number.isFinite(actual)) {
    if (manifest.duration == null) {
      manifest.duration = actual;
    } else if (Math.abs(actual - manifest.duration) > 0.5) {
      console.error(`警告: manifest の尺 ${manifest.duration}s と実ファイル ${actual.toFixed(1)}s が0.5s超ずれている`);
    }
  }
}

const result = auditTelops(manifest);
console.log(formatReport(manifest, result));
process.exit(result.ng > 0 ? 1 : 0);
