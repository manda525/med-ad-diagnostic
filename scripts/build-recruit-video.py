import subprocess, json, os

FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
W, H, FPS = 1080, 1920, 30
XF = 0.4  # ディゾルブ長

def E(expr):
    """フィルタグラフ内で式のカンマをエスケープする"""
    return expr.replace(",", r"\,")

def ease_p(delay, dur):
    """0→1 の進行度"""
    return f"min(max(t-{delay},0)/{dur},1)"

# (id, 尺, ラベル, 本文, 補足/要記入, 法定明示か)
SCENES = [
 ("s1",  8.5, "有限会社橋詰調剤", "薬剤師募集",
  "しみず薬局（高知県土佐清水市）\nなかむら薬局（高知県四万十市）", False),
 ("s2",  7.5, "", "高知県の西端で\nへき地医療を支える\n調剤薬局です",
  "地域の患者さんを、長く診る仕事", False),
 ("s3", 11.5, "従事すべき業務の内容", "調剤／服薬指導\n在宅訪問／医薬品の管理",
  "【変更の範囲】\n要記入：将来従事しうる業務の範囲", True),
 ("s4", 10.0, "就業場所", "しみず薬局\n（高知県土佐清水市）",
  "【変更の範囲】\n要記入：なかむら薬局への\n配置転換の有無", True),
 ("s5", 13.5, "始業・終業時刻／休憩／休日", "",
  "要記入：始業◯時／終業◯時\n要記入：休憩◯分\n要記入：週休◯日・年間休日◯日\n要記入：時間外労働の有無", True),
 ("s6",  9.0, "賃金", "",
  "要記入：月給◯円〜◯円\n要記入：固定残業代の有無と時間数\n要記入：昇給・賞与", True),
 ("s7", 13.0, "契約期間／試用期間／保険", "",
  "要記入：契約期間\n要記入：試用期間と期間中の条件\n要記入：社会保険・労働保険\n要記入：受動喫煙防止措置", True),
 ("s8",  7.5, "ご応募・お問い合わせ", "有限会社橋詰調剤",
  "要記入：電話番号／メール／応募フォーム", False),
]

TOTAL_RAW = sum(s[1] for s in SCENES)
TOTAL = TOTAL_RAW - XF * (len(SCENES) - 1)

def drawtext(path, size, color, y_expr, alpha_expr, spacing=30):
    return (f"drawtext=fontfile={FONT}:textfile={path}:fontsize={size}:fontcolor={color}"
            f":x=(w-text_w)/2:y={E(y_expr)}:alpha={E(alpha_expr)}:line_spacing={spacing}")

timeline, files, gstart = [], [], 0.0
for sid, dur, label, body, fill, legal in SCENES:
    layers = []
    # 動く背景（グラデーションがゆっくり流れる）＋ヴィネット＋粒子感
    layers.append("vignette=PI/4.5")
    layers.append("noise=alls=5:allf=t+u")

    # 上部アクセントバー：0.7秒かけて横に伸びる
    p_bar = ease_p(0.0, 0.7)
    layers.append(f"drawbox=x=0:y=0:w='{E(f'{W}*(1-pow(1-{p_bar},3))')}':h=10:color=0x67e8f9@0.95:t=fill")

    if label:
        open(f"{sid}_l.txt","w").write(label)
        layers.append(drawtext(f"{sid}_l.txt", 46, "0x67e8f9", "520", ease_p(0.10, 0.45)))

    y_body = 700
    if body:
        open(f"{sid}_b.txt","w").write(body)
        p = ease_p(0.25, 0.60)
        layers.append(drawtext(f"{sid}_b.txt", 84, "white",
                               f"{y_body}+55*pow(1-{p},3)", p, 36))

    if fill:
        open(f"{sid}_f.txt","w").write(fill)
        y_fill = y_body + (130*(body.count(chr(10))+1) + 95 if body else 0)
        p = ease_p(0.55, 0.60)
        color = "0xfbbf24" if (legal or sid == "s8") else "0xcbd5e1"
        layers.append(drawtext(f"{sid}_f.txt", 52, color,
                               f"{y_fill}+40*pow(1-{p},3)", p, 32))

    # 下部：進行バー（動画全体のどこにいるか）
    prog = f"{W}*({gstart}+t)/{TOTAL}"
    layers.append(f"drawbox=x=0:y={H-8}:w='{E(prog)}':h=8:color=0x67e8f9@0.85:t=fill")

    open(f"{sid}_brand.txt","w").write("Pharma-Ad Lab 監修")
    layers.append(drawtext(f"{sid}_brand.txt", 32, "0x67e8f9@0.8", "1790", ease_p(0.5, 0.6)))

    bg = (f"gradients=s={W}x{H}:c0=0x0a1f2e:c1=0x134e5e:c2=0x0d3446:x0=0:y0=0:x1={W}:y1={H}"
          f":nb_colors=3:speed=0.006:d={dur}:r={FPS}")
    cmd = ["ffmpeg","-y","-f","lavfi","-i",bg,
           "-vf",",".join(layers),"-t",str(dur),
           "-c:v","libx264","-preset","medium","-crf","20","-pix_fmt","yuv420p", f"a_{sid}.mp4"]
    subprocess.run(cmd, check=True, capture_output=True)
    files.append(f"a_{sid}.mp4")
    chars = len((label+body+fill).replace("\n",""))
    read_time = dur - 1.0   # 立ち上がりとディゾルブを除いた実質表示時間
    timeline.append({"scene":sid,"開始":round(gstart,1),"尺":dur,"実質表示":round(read_time,1),
                     "文字数":chars,"文字毎秒":round(chars/read_time,1),"法定明示":legal})
    gstart += dur - XF

print(f"シーン生成完了 {len(files)}本 / 総尺 {TOTAL:.1f}秒（ディゾルブ{XF}秒×{len(SCENES)-1}）")
json.dump(timeline, open("timeline2.json","w"), ensure_ascii=False, indent=2)
for r in timeline:
    lim = 5.0 if r["法定明示"] else 6.0
    print(f"  {'法定' if r['法定明示'] else '    '} {r['scene']} 尺{r['尺']:5.1f}s 実質{r['実質表示']:5.1f}s "
          f"{r['文字数']:3d}字 {r['文字毎秒']:4.1f}字/秒 上限{lim} {'OK' if r['文字毎秒']<=lim else 'NG'}")
