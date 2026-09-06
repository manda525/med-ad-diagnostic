import subprocess, os, json

FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
W, H, FPS = 1080, 1920, 30
BG, INK, LABEL, FILL = "0x0f2b3d", "white", "0x67e8f9", "0xfbbf24"

# (id, 秒数, ラベル, 本文, 要記入ブロック, 法定明示か)
SCENES = [
 ("s1", 7.5, "有限会社橋詰調剤", "薬剤師募集", "しみず薬局（高知県土佐清水市）\nなかむら薬局（高知県四万十市）", False),
 ("s2", 6.5, "", "高知県の西端で\nへき地医療を支える\n調剤薬局です", "地域の患者さんを、長く診る仕事", False),
 ("s3", 10.5, "従事すべき業務の内容", "調剤／服薬指導\n在宅訪問／医薬品の管理", "【変更の範囲】\n要記入：将来従事しうる業務の範囲", True),
 ("s4", 9.5, "就業場所", "しみず薬局\n（高知県土佐清水市）", "【変更の範囲】\n要記入：なかむら薬局への\n配置転換の有無", True),
 ("s5", 12.5, "始業・終業時刻／休憩／休日", "", "要記入：始業◯時／終業◯時\n要記入：休憩◯分\n要記入：週休◯日・年間休日◯日\n要記入：時間外労働の有無", True),
 ("s6", 8.0, "賃金", "", "要記入：月給◯円〜◯円\n要記入：固定残業代の有無と時間数\n要記入：昇給・賞与", True),
 ("s7", 12.5, "契約期間／試用期間／保険", "", "要記入：契約期間\n要記入：試用期間と期間中の条件\n要記入：社会保険・労働保険\n要記入：受動喫煙防止措置", True),
 ("s8", 7.0, "ご応募・お問い合わせ", "有限会社橋詰調剤", "要記入：電話番号／メール／応募フォーム", False),
]

def dt(path, size, color, y, spacing=26):
    return (f"drawtext=fontfile={FONT}:textfile={path}:fontcolor={color}:fontsize={size}"
            f":x=(w-text_w)/2:y={y}:line_spacing={spacing}")

files, timeline, t = [], [], 0.0
for sid, dur, label, body, fill, legal in SCENES:
    layers = [f"drawbox=x=0:y=0:w={W}:h=12:color={LABEL}:t=fill"]
    if label:
        open(f"{sid}_l.txt","w").write(label)
        layers.append(dt(f"{sid}_l.txt", 46, LABEL, 520))
    if body:
        open(f"{sid}_b.txt","w").write(body)
        layers.append(dt(f"{sid}_b.txt", 82, INK, 700, 34))
    if fill:
        open(f"{sid}_f.txt","w").write(fill)
        y = 700 if not body else 700 + 130*(body.count("\n")+1) + 90
        open(f"{sid}_f.txt","w").write(fill)
        layers.append(dt(f"{sid}_f.txt", 52, FILL if legal or sid=="s8" else INK, y, 30))
    open(f"{sid}_brand.txt","w").write("Pharma-Ad Lab 監修")
    layers.append(dt(f"{sid}_brand.txt", 32, LABEL, 1780))
    cmd = ["ffmpeg","-y","-f","lavfi","-i",f"color=c={BG}:s={W}x{H}:d={dur}:r={FPS}",
           "-vf",",".join(layers),"-c:v","libx264","-pix_fmt","yuv420p",f"{sid}.mp4"]
    subprocess.run(cmd, check=True, capture_output=True)
    files.append(f"{sid}.mp4")
    timeline.append({"scene":sid,"start":round(t,1),"end":round(t+dur,1),"秒数":dur,
                     "法定明示":legal,"文字数":len((label+body+fill).replace("\n","")),
                     "文字毎秒":round(len((label+body+fill).replace("\n",""))/dur,1)})
    t += dur

open("list.txt","w").write("\n".join(f"file '{f}'" for f in files))
subprocess.run(["ffmpeg","-y","-f","concat","-safe","0","-i","list.txt","-c","copy",
                "hashizume_recruit.mp4"], check=True, capture_output=True)
json.dump(timeline, open("timeline.json","w"), ensure_ascii=False, indent=2)
print(f"総尺 {t}秒 / {len(files)}シーン")
for r in timeline:
    mark = "法定" if r["法定明示"] else "  "
    print(f"  {mark} {r['scene']} {r['start']:5.1f}s-{r['end']:5.1f}s  {r['秒数']:4.1f}秒  {r['文字数']:3d}字  {r['文字毎秒']}字/秒")
