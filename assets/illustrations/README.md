# イラスト素材（ベクター）

動画の素材を撮影できない案件のために、店内シーンをベクターで持つ。生成AIと違い、
毎回まったく同じ絵が出るため、シリーズものの動画で見た目が揃う。色や配置は SVG を
直接書き換えて調整する。

| ファイル | 内容 | サイズ |
|---|---|---|
| `pharmacy_window.svg` | 窓の外の景色（空・海・山・夕日）。視差で背面を動かす用 | 1200×1000 |
| `pharmacy_interior.svg` | 店内（壁・窓枠・棚・薬箱・薬剤師・カウンター）。窓部分は透過 | 1080×1920 |
| `light_rays.svg` | 窓から差す光。重ねて動かす | 1000×900 |

## 使い方

```bash
# ラスタライズ
rsvg-convert -w 1200 -h 1000 assets/illustrations/pharmacy_window.svg -o /tmp/bg.png
rsvg-convert -w 1080 -h 1920 assets/illustrations/pharmacy_interior.svg -o /tmp/fg.png

# 合成（背面を視差でゆっくり動かす）
ffmpeg -loop 1 -t 12 -i /tmp/bg.png -loop 1 -t 12 -i /tmp/fg.png -filter_complex \
  "[0:v]scale=1242:1035,crop=1080:900:x='81+26*sin(t/5)':y='67+14*sin(t/7)',setsar=1[bg];\
   color=c=0x07161f:s=1080x1920:d=12:r=30[base];[base][bg]overlay=0:180:shortest=1[b];\
   [b][1:v]overlay=0:0,vignette=PI/5[v]" -map "[v]" -c:v libx264 -pix_fmt yuv420p out.mp4
```

`rsvg-convert` は `apt-get install librsvg2-bin` で入る。

## 注意

人物は顔を描き込まないシルエット寄りの表現にしてある。実在の薬剤師を想起させないため。
医療広告では、実在しない人物を医療従事者や患者らしく見せること自体が誤認のリスクになる
（`docs/video_ops.md` §2、`L-VIDEO-BA`）。イメージ素材として使い、実在の店舗や
スタッフの紹介には実写を使う。
