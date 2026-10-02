#!/usr/bin/env node
// 動画AIで作ったカットを繋ぎ、テロップを焼き込んで書き出す。
//
//   node scripts/assemble-video.mjs <manifest.json> --out out.mp4 [--dir 素材フォルダ] [--force]
//
// manifest はテロップ台本（audit:video と同じ形式）に clips を足したもの。
//   "clips": [{ "file": "c1.mp4", "duration": 5, "source": "shimizu.jpg" }, ...]
//   "bgm": "bgm.mp3"   ← 任意
// source には動画AIへ渡した元写真を書く。書いておくと、生成された動画の1コマ目が
// 元写真からどれだけ変わったかを測り、建物や看板が作り替えられていないかの目安にする。
//
// 手順：①テロップを検収（NGがあれば書き出さない）②カット尺の合計と台本の尺を照合
// ③元写真との一致度を測る ④確認用のコマ一覧を書き出す ⑤焼き込み ⑥完成品の実尺で再検収

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { auditTelops, formatReport } from "../lib/videoAudit.js";
import { buildFilterComplex, findPositionConflicts, OUT } from "../lib/videoAssemble.js";

const FONT = process.env.TELOP_FONT || "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf";
// 1コマ目の一致度（SSIM）がこれを下回ったら、元写真から作り替えられた疑いとして警告する。
// 経験則の目安であって厳密な基準ではない。写真を忠実に動かしたカットは0.99前後、
// 別の絵にすり替わったカットは試験で0.62だった（2026-10-02）。最終的にはコマ一覧を目で確認する。
const SSIM_WARN = Number(process.env.SSIM_WARN || 0.85);

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const manifestPath = args.find((a, i) => !a.startsWith("--") && !["--out", "--dir"].includes(args[i - 1]));
const outPath = opt("--out");
const force = args.includes("--force");
if (!manifestPath || !outPath) {
  console.error("使い方: node scripts/assemble-video.mjs <manifest.json> --out out.mp4 [--dir 素材フォルダ] [--force]");
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const dir = path.resolve(opt("--dir") || path.dirname(manifestPath));
const at = (f) => path.resolve(dir, f);
const run = (cmd, a) => execFileSync(cmd, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const clips = manifest.clips || [];
if (clips.length === 0) { console.error("clips が空。カットを指定する"); process.exit(2); }
for (const c of clips) {
  if (!fs.existsSync(at(c.file))) { console.error(`カットが見つからない: ${at(c.file)}`); process.exit(2); }
}

// ① テロップ検収。NGのまま焼き込むと、直すには書き出し直しになる。
const pre = auditTelops(manifest);
console.log(formatReport(manifest, pre));
if (pre.ng > 0 && !force) {
  console.error("\nテロップにNGがあるため書き出しを止めた（--force で強行できるが推奨しない）");
  process.exit(1);
}

// 同じ配置のテロップが同時に出ていたら、文字が重なって読めないので止める
const conflicts = findPositionConflicts(manifest.telops);
if (conflicts.length) {
  for (const c of conflicts) {
    console.error(`テロップ「${c.a}」と「${c.b}」が同じ位置（${c.position}）に${c.seconds.toFixed(1)}秒重なっている。片方に "position": "note" を付けるか時間をずらす`);
  }
  process.exit(1);
}

// ② 尺の照合
const { filter, total, laid } = (() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "telop-"));
  const telopFiles = (manifest.telops || []).map((t, i) => {
    const f = path.join(tmp, `t${i}.txt`);
    fs.writeFileSync(f, String(t.text));
    return { telop: t, file: f };
  });
  return buildFilterComplex(clips, telopFiles, FONT);
})();
if (manifest.duration != null && Math.abs(total - manifest.duration) > 0.05) {
  console.error(`カット尺の合計 ${total}s と台本の尺 ${manifest.duration}s が合わない`);
  process.exit(1);
}

// ③ 元写真との一致度、④ 確認用のコマ一覧
const outDir = path.dirname(path.resolve(outPath));
const base = path.basename(outPath, path.extname(outPath));
const checks = [];
const norm = `scale=${OUT.w}:${OUT.h}:force_original_aspect_ratio=increase,crop=${OUT.w}:${OUT.h}`;
for (const c of laid) {
  const row = { file: c.file, start: c.start, end: c.end, ssim: null, level: "—" };
  if (c.source) {
    if (!fs.existsSync(at(c.source))) {
      row.level = "WARN"; row.note = `元写真が見つからない: ${c.source}`;
    } else {
      // ffmpeg は ssim の結果を stderr に出すので spawnSync で拾う（シェルを通さない）
      const r = spawnSync("ffmpeg", ["-hide_banner", "-i", at(c.source), "-i", at(c.file),
        "-filter_complex", `[0:v]${norm},format=gray[a];[1:v]trim=end_frame=1,${norm},format=gray[b];[a][b]ssim`,
        "-frames:v", "1", "-f", "null", "-"], { encoding: "utf8" });
      const err = String(r.stderr || "");
      const m = err.match(/All:([0-9.]+)/);
      row.ssim = m ? Number(m[1]) : null;
      row.level = row.ssim == null ? "WARN" : row.ssim < SSIM_WARN ? "WARN" : "OK";
      if (row.level === "WARN") row.note = row.ssim == null ? "一致度を測れなかった" : "元写真から作り替えられた疑い。コマ一覧で建物・看板・文字を確認";
    }
  }
  checks.push(row);
}
const sheet = path.join(outDir, `${base}_コマ一覧.png`);
const inputs = laid.flatMap((c) => ["-i", at(c.file)]);
const tiles = laid.map((c, i) =>
  `[${i}:v]select='eq(n\\,0)+eq(n\\,${Math.floor(c.duration * OUT.fps / 2)})+eq(n\\,${Math.floor(c.duration * OUT.fps) - 2})',` +
  `${norm},scale=240:-1,tile=3x1[r${i}]`).join(";");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex",
  `${tiles};${laid.map((_, i) => `[r${i}]`).join("")}vstack=inputs=${laid.length}`, "-frames:v", "1", "-vsync", "0", sheet]);

// ⑤ 書き出し
const bgm = manifest.bgm ? at(manifest.bgm) : null;
const ffArgs = ["-y", "-hide_banner", "-loglevel", "error", ...inputs];
let audioMap = ["-an"];
let fc = filter;
if (bgm) {
  ffArgs.push("-i", bgm);
  const ai = laid.length;
  fc += `;[${ai}:a]atrim=0:${total},afade=t=in:d=0.8,afade=t=out:st=${Math.max(0, total - 1.5)}:d=1.5,loudnorm=I=-16:TP=-1.5[a]`;
  audioMap = ["-map", "[a]", "-c:a", "aac", "-b:a", "160k"];
}
run("ffmpeg", [...ffArgs, "-filter_complex", fc, "-map", "[v]", ...audioMap,
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outPath]);

// ⑥ 実尺で再検収
const actual = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", outPath]).trim());
const post = auditTelops({ ...manifest, duration: actual });

const lines = [];
lines.push(formatReport({ ...manifest, duration: actual.toFixed(1) }, post));
lines.push("");
lines.push("■ 元写真との一致度（1コマ目のSSIM。1.0で完全一致）");
for (const r of checks) {
  lines.push(`  ${r.level.padEnd(4)} ${r.file}  ${r.start}s–${r.end}s  ${r.ssim == null ? "" : r.ssim.toFixed(3)}${r.note ? "  " + r.note : ""}`);
}
lines.push(`  ※目安は ${SSIM_WARN}。カメラが動く前の1コマ目で測っている。最終確認はコマ一覧で行う`);
lines.push("");
lines.push(`書き出し：${outPath}（${actual.toFixed(1)}s）`);
lines.push(`コマ一覧：${sheet}（各カットの最初・中間・最後）`);
const report = lines.join("\n");
fs.writeFileSync(path.join(outDir, `${base}_検収.txt`), report + "\n");
console.log("\n" + report);
process.exit(post.ng > 0 ? 1 : 0);
