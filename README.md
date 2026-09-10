# 広告リスク診断ツール v2

薬剤師 × 医療広告コンサルタント「まさ」（Pharma-Ad Lab）が開発する、業種×媒体対応のAI一次診断ツール。

## v2 アーキテクチャ（2026-07-07）

「業種を選ぶ → 媒体を選ぶ → その組み合わせに効く見解を返す」構造。

```
data/law_master.json     法令マスター（25ノード・一次ソース検証済み）← 判定根拠の源泉
data/rulebook_v2.json    ルールブック（801件・law_id/業種/媒体タグつき）← build:rulebook で生成
data/stats.json          クライアント表示用スタッツ ← 同上
lib/taxonomy.js          業種（8カテゴリ）×媒体（10種）の共通タクソノミー
lib/engine.js            フィルタ→マッチング→プロンプト構築＋構造化出力スキーマ
pages/api/diagnose.js    診断API（claude-fable-5 + opus-4-8 fallback + 構造化出力）
components/DiagnosticV2.jsx  ウィザードUI（業種→媒体→入力→結果）
lib/videoAudit.js        動画テロップの検収（表示秒数・打消し表示の同時性・PR表記・禁止語）
scripts/video-audit.mjs  検収CLI。NGがあれば終了コード1
docs/requirements_v2.md  要件定義書
docs/law_master.md       法令マスター（人間可読版・一次ソースURL）
docs/video_ops.md        動画案件の運用設計（工程・発注仕様・検収・単価）
```

### 設計の要点
- **法令マスター**：法令・条文・判定要点・改正日・一次ソースURLを構造化。各ルールは `law_ids` で紐づき、診断は必ず条文根拠つきで返る。
- **業種×媒体フィルタ**：ルールと法令ノードを業種・媒体で絞ってからAIへ。業種違いの誤検知を構造的に排除。既存ルールが無い業種（医療・施術・ペット等）も法令ノードの注入で判定可能。
- **F（広告・制作）**は受託先業種の規制を継承＋ステマ規制・表示主体責任を追加。
- **モデル**：`claude-fable-5`（thinking常時オン）。refusal時は同一リクエスト内で `claude-opus-4-8` に自動フォールバック。構造化出力（output_config.format）でJSON保証。

- **利用枠**：無料6回はサーバー側で計上する（署名付きHttpOnly Cookieの訪問者ID＋IP単位のレート制限）。クライアントから送られる回数の申告は使わない。

## デプロイ

### 必須環境変数（Vercel側で設定）

| 変数名 | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic ConsoleのAPIキー |
| `STRIPE_SECRET_KEY` | Stripe 秘密鍵 |
| `STRIPE_PRICE_INDIVIDUAL` | 個人プランの price ID |
| `STRIPE_PRICE_CORPORATE` | 法人プランの price ID |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook の署名シークレット |
| `APP_TOKEN_SECRET` | エンタイトルメントトークン＋訪問者ID Cookie の署名用。**変更すると既存の課金ユーザーのトークンが無効になる** |
| `NEXT_PUBLIC_SITE_URL` | 本番URL（Stripeの戻り先） |

### 任意環境変数

| 変数名 | 既定 | 用途 |
|---|---|---|
| Upstash Redis の REST URL / TOKEN | — | 利用回数・レート制限のストア。**未設定だとプロセス内メモリにフォールバックし、計上が厳密でなくなる** |

Upstash の変数名は作り方で変わるため、次の順で探す（先に見つかった組を使う）。

| URL | TOKEN | 作り方 |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | `UPSTASH_REDIS_REST_TOKEN` | Upstash で直接データベースを作成 |
| `UPSTASH_REDIS_REST_KV_REST_API_URL` | `UPSTASH_REDIS_REST_KV_REST_API_TOKEN` | Vercel の Storage 連携（接頭辞 `UPSTASH_REDIS_REST`）**← 本番はこれ** |
| `KV_REST_API_URL` | `KV_REST_API_TOKEN` | Vercel の Storage 連携（接頭辞なし） |
| `DIAGNOSE_MODEL` | `claude-fable-5` | 診断モデル |
| `DIAGNOSE_EFFORT` | `medium` | `output_config.effort` |

## テスト

```bash
npm test                # 全テスト（利用枠・マッチャ・監修・推定・動画検収）
npm run test:security   # 利用枠とレート制限の回帰テスト。AI・Stripeを呼ばないので費用も外部通信もかからない
```

いずれもAI・Stripeを呼ばないため、費用も外部通信もかからない。

## 動画案件の検収

編集者から受け取ったテロップ表を機械で当てる。動画は「何を書いたか」に加えて「何秒間、どの順で出したか」が問われるため、目視の流し見では秒数の不足を検出できない。

```bash
npm run audit:video -- docs/case_hashizume_recruit_telops.json --video 納品.mp4
```

読了速度の超過、最低表示秒数の不足、打消し表示が強調表示と別カットになっていないか、PR表記が冒頭にあるか、必須項目の欠落、確定稿に残った仮テキストや求人NG表現を判定する。NGが1件でもあれば終了コード1。閾値（`lib/videoAudit.js` の `DEFAULT_THRESHOLDS`）は実務上の設計値であって、行政が定めた基準値ではない。

## ルール更新フロー

1. 正本 `rulebook_master`（Drive）を更新（SOP準拠）
2. `rulebook.json` を正本と同期
3. `npm run build:rulebook` で `data/rulebook_v2.json` / `data/stats.json` を再生成
4. コミット→PR→まさ承認でマージ（Vercelが自動デプロイ）

法令マスターの更新は `docs/law_master.md`（人間可読）と `data/law_master.json`（機械可読）を両方更新する。

## 開発

```bash
npm install
npm run build:rulebook   # data/ 生成（初回・ルール更新時）
npm run dev
```

http://localhost:3000 で起動します。
