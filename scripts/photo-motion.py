#!/usr/bin/env python3
"""写真1枚から、カメラがゆっくり動く縦型の動画カットを作る。

  python3 scripts/photo-motion.py shots.json --dir 素材フォルダ --outdir 出力フォルダ

shots.json の各カット：
  { "out": "s1.mp4", "image": "shimizu.jpg", "duration": 5,
    "from": [cx, cy, zoom], "to": [cx, cy, zoom] }
  cx, cy  … 画面の中心を写真のどこに置くか（0〜1。0.5,0.5 が写真の中央）
  zoom    … 写真の高さのうち、画面に映す割合（1.0 で写真の高さいっぱい、0.6 なら寄り）

写真の中身には手を加えない。切り出す位置と大きさを時間で動かすだけなので、
動画AIのように建物や看板が作り替えられることがない。
動きは始めと終わりがなめらかになる smoothstep で補間する。
2倍の解像度で切り出してから縮小し、1ピクセル単位の揺れを目立たなくしている。
"""
import json, subprocess, sys, os, argparse

W, H, FPS = 1080, 1920, 30
SS = 2  # 内部の倍率（揺れ対策）

def ease(D):
    p = f"clip(t/{D},0,1)"
    return f"({p})*({p})*(3-2*({p}))"

def lerp(a, b, e):
    return f"({a}+({b}-({a}))*{e})"

def build_filter(img_w, img_h, shot):
    D = float(shot["duration"])
    (cx0, cy0, z0), (cx1, cy1, z1) = shot["from"], shot["to"]
    e = ease(D)
    zoom = lerp(z0, z1, e)
    # 画面の高さ(H*SS)に、写真の zoom 分の高さが収まる倍率
    s = f"({H*SS}/({img_h}*{zoom}))"
    cx = lerp(cx0, cx1, e)
    cy = lerp(cy0, cy1, e)
    ow, oh = W * SS, H * SS
    return (
        f"scale=w='trunc({img_w}*{s}/2)*2':h='trunc({img_h}*{s}/2)*2':eval=frame:flags=lanczos,"
        f"crop={ow}:{oh}:x='clip({cx}*iw-{ow/2},0,iw-{ow})':y='clip({cy}*ih-{oh/2},0,ih-{oh})',"
        f"scale={W}:{H}:flags=lanczos,setsar=1"
    )

def probe(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=width,height",
                                   "-of", "csv=p=0", path], text=True).strip().split(",")
    return int(out[0]), int(out[1])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("shots")
    ap.add_argument("--dir", default=".")
    ap.add_argument("--outdir", default=".")
    ap.add_argument("--grade", default="", help="仕上げに足すフィルタ（色調など）")
    a = ap.parse_args()
    shots = json.load(open(a.shots, encoding="utf-8"))
    os.makedirs(a.outdir, exist_ok=True)
    for shot in shots:
        img = os.path.join(a.dir, shot["image"])
        iw, ih = probe(img)
        # 一番寄ったときでも写真の幅が画面の幅を下回らないか（下回ると端に黒が出る）
        for cx, cy, z in (shot["from"], shot["to"]):
            vis_w = ih * z * W / H
            if vis_w > iw:
                sys.exit(f"{shot['out']}: zoom={z} では画面の幅が写真の幅を超える。zoom を小さくする")
        vf = build_filter(iw, ih, shot) + (("," + a.grade) if a.grade else "") + ",format=yuv420p"
        out = os.path.join(a.outdir, shot["out"])
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                        "-loop", "1", "-framerate", str(FPS), "-i", img,
                        "-vf", vf, "-t", str(shot["duration"]), "-r", str(FPS),
                        "-c:v", "libx264", "-preset", "medium", "-crf", "18", out], check=True)
        print(f"  {shot['out']}  {shot['duration']}s  {shot['image']}  {shot['from']} → {shot['to']}")

if __name__ == "__main__":
    main()
