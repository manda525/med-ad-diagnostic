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
docs/requirements_v2.md  要件定義書
docs/law_master.md       法令マスター（人間可読版・一次ソースURL）
```

### 設計の要点
- **法令マスター**：法令・条文・判定要点・改正日・一次ソースURLを構造化。各ルールは `law_ids` で紐づき、診断は必ず条文根拠つきで返る。
- **業種×媒体フィルタ**：ルールと法令ノードを業種・媒体で絞ってからAIへ。業種違いの誤検知を構造的に排除。既存ルールが無い業種（医療・施術・ペット等）も法令ノードの注入で判定可能。
- **F（広告・制作）**は受託先業種の規制を継承＋ステマ規制・表示主体責任を追加。
- **モデル**：`claude-fable-5`（thinking常時オン）。refusal時は同一リクエスト内で `claude-opus-4-8` に自動フォールバック。構造化出力（output_config.format）でJSON保証。

## デプロイ

### 必須環境変数（Vercel側で設定）

| 変数名 | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic ConsoleのAPIキー |
| `STRIPE_SECRET_KEY` | Stripe 秘密鍵 |
| `APP_TOKEN_SECRET` | エンタイトルメントトークン署名用 |
| `DIAGNOSE_MODEL` | （任意）既定 `claude-fable-5` |
| `DIAGNOSE_EFFORT` | （任意）既定 `medium` |

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
