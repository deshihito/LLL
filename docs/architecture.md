# LLL Architecture

## 目的

LLLは、動的カードゲームのゲームルールを中心に、プレイヤー向けWebアプリとDiscord上の補助サービスを提供する。両者は同じゲーム概念を扱うが、UI・イベントモデル・デプロイ単位は分離する。

## 境界

| 領域 | 主な責務 | 依存してよい領域 |
| --- | --- | --- |
| `apps/web` | 画面、Web向けAPI、プレイヤー操作 | `packages/domain`, `packages/shared`, `packages/config` |
| `apps/discord` | Botコマンド、Discordイベント、通知 | `packages/domain`, `packages/shared`, `packages/config` |
| `packages/domain` | カード、デッキ、ゲーム状態、ルール計算 | 外部サービスに依存しないことを目標にする |
| `packages/shared` | DTO、識別子、共通定数、汎用ユーティリティ | ドメインの詳細を持ちすぎない |
| `packages/config` | 環境変数の定義と検証 | 実行環境ごとの設定 |
| `infra/supabase` | 将来のスキーマ、マイグレーション、Edge Functions | Supabase（今回は未作成） |

## データフローの想定

1. WebまたはDiscordがユーザー操作を受け取る。
2. 各アプリのユースケース層が入力を検証する。
3. `packages/domain`のルールを呼び出してゲーム状態を計算する。
4. 将来のデータアクセス層がSupabaseへ永続化する。
5. Webは画面へ、Discordはメッセージやリアクションへ結果を返す。

アプリからSupabase SDKを直接呼び出すのではなく、将来はアプリごとの`repositories`または`adapters`層を挟み、DB変更の影響を閉じ込める。

## 将来追加する境界

- `domain`: カード定義、効果、ターン進行、勝敗判定
- `application`: 対戦開始、カード編集、デッキ管理などのユースケース
- `infrastructure`: Supabase、認証、外部API、Discord SDK
- `interfaces`: Web API/UI、Discordコマンド・イベント

この雛形では実装を開始せず、上記の配置先だけを用意している。
