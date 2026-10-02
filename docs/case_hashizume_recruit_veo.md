# 事例1号 30秒版：Veo（Gemini Pro）で作るカット表

作成：2026-10-02／素材＝本物の店舗写真（スマホ撮影）＋ Pexels の風景写真
テロップ台本：`docs/case_hashizume_recruit_30s_telops.json`（`npm run audit:video` で検収OK済み）

---

## 1. 方針

映像はVeo、テロップと検収はこちらで担当する。Veoには【文字を一切描かせない】。生成AIは日本語の文字を崩すうえ、後から直せないため。テロップは書き出し後に載せ、`audit:video` で秒数を確認する。

人物は生成しない。白衣の人物を生成したり、Pexelsのモデル写真を使ったりすると、実在しない薬剤師が自社のスタッフに見えるため。店舗のカットは本物の写真を動かすだけにとどめ、建物や看板の形が変わっていないかを書き出し後に1コマずつ確認する。看板の文字が化けたり、存在しない設備が足されたりしていれば、求人の誤認表示になるので不採用にする。

労働条件（職業安定法の明示事項）は30秒には収まらない（74秒版での実測で、明示事項だけで44.5秒）。動画の中では「募集要項はプロフィールのリンクから」と案内し、リンク先の募集要項に全項目を載せる。応募の前に明示が済む導線にしておくこと。

## 2. カット表（縦型9:16・5秒×6カット）

| # | 秒 | 素材 | 動き | テロップ |
|---|---|---|---|---|
| 1 | 0–5 | Pexels：朝の太平洋・岬 | ゆっくり前進、波が動く | 高知県の西の端で／映像はイメージです |
| 2 | 5–10 | Pexels：川・山あいの道 | 川沿いに横移動、朝もや | 地域の薬を、長く支える |
| 3 | 10–15 | 実写：しみず薬局の外観 | ゆっくり寄る。建物は動かさない | しみず薬局／高知県土佐清水市 |
| 4 | 15–20 | 実写：店内の棚・調剤台 | ゆっくり横へ流す | 調剤／服薬指導／在宅訪問 |
| 5 | 20–25 | 実写：なかむら薬局の外観 | ゆっくり寄る | なかむら薬局／高知県四万十市 |
| 6 | 25–30 | Pexels：夕方の海 or 実写：看板 | ほぼ静止、光だけ変わる | 薬剤師募集／有限会社橋詰調剤／募集要項はプロフィールのリンクから |

### Pexelsで探す語

`Japan coast sunrise`、`Pacific ocean cliff Japan`、`Shimanto river`、`rural Japan river mist`、`Japan countryside road`、`ocean sunset Japan`

人物が写っていないもの、商品のロゴやブランド名が写っていないものを選ぶ。

### 実写で撮るもの（スマホ・横にしない縦のまま）

しみず薬局の外観、なかむら薬局の外観、店内の棚、調剤台。スタッフや患者さんが写らない時間に撮る。処方箋や薬袋の患者名が写り込まないよう注意する。

## 3. Veoに貼る指示文

Gemini（またはFlow）に写真を1枚添付し、下の文をそのまま貼る。英語のほうが指示が通りやすい。各カットとも、共通の末尾を必ず付ける。

共通の末尾：

```
Vertical 9:16, 5 seconds. Camera movement only.
Do not add, remove, or change any object, building, sign, or text in the photo.
No people. No text, no captions, no logos. Ambient sound only, no speech, no music.
Natural colors, realistic, calm pace.
```

| # | 指示文（先頭に置く） |
|---|---|
| 1 | `Slow forward drone-like push over the ocean at sunrise. Gentle waves, soft morning light.` |
| 2 | `Slow sideways camera slide along the river. Light morning mist drifting.` |
| 3 | `Very slow dolly-in toward the pharmacy building. Morning light, slight movement of leaves only. Keep the building exactly as in the photo.` |
| 4 | `Very slow horizontal pan across the shelves. Soft indoor light. Keep every item and label exactly as in the photo.` |
| 5 | `Very slow dolly-in toward the pharmacy building. Afternoon light. Keep the building exactly as in the photo.` |
| 6 | `Almost static shot. Only the light slowly shifts toward sunset.` |

Gemini Proの上限（処理量ベース、5時間ごとリセット＋週上限）を考えると、1日2〜3カットのペースで回し、気に入ったものだけ残すのが現実的。

## 4. 書き出し後の流れ

1. 6本のMP4をGoogleドライブの1フォルダに入れる
2. こちらでドライブから取り込み、カットを繋いでテロップとBGMを載せる
3. 店舗カットは1コマずつ確認する（建物・看板・文字が写真と違っていないか）
4. `npm run audit:video` で秒数と禁止語を検収し、結果を添えて返す

## 5. 残っている確認

- Pexelsの規約に、動画生成AIへの入力を明示的に扱った記述があるかは未確認（この環境から pexels.com に直接アクセスできない）。人物なしの風景に限っているのでリスクは小さいが、公開前にまさがライセンスページを確認する
- リンク先の募集要項（職業安定法の明示事項12項目）は未作成。`docs/case_hashizume_recruit.md` §5 の項目を父・母から取る
