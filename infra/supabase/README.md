# Supabase foundation

## Apply

Supabase Dashboard → **SQL Editor**で、次の順番に実行します。

1. `migrations/20261002000000_initial.sql`
2. 未適用の場合のみ`migrations/20261002010000_user_and_generation_foundation.sql`
3. `migrations/20261002020000_skill_effect_schema.sql`
4. `migrations/20261002030000_battle_foundation.sql`
5. `migrations/20261003000000_server_authority.sql`
6. `migrations/20261003010000_card_scout_tier.sql`
7. `migrations/20261003020000_ap_support_deck.sql`
8. `migrations/20261003030000_trial_battle_and_support_triggers.sql`

適用確認は`checks/20261003030000_trial_battle_and_support_triggers_check.sql`をSQL Editorで実行してください。公開カード不整合数は`0`、その他の確認結果は`true`が期待値です。

`type "card_type" already exists`と表示される場合、初期SQLはすでに一部または全部が適用済みです。初期SQLを再実行せず、2つ目の`20261002010000_user_and_generation_foundation.sql`だけを実行してください。

Supabase CLIを使う場合：

```bash
supabase db push
```

## Tables

- `profiles`: `auth.users`と1対1のプレイヤー情報
- `cards`: アクション／パーツ／サポートカード、ステータス、生成状態
- `card_skills`: カードごとの最大3スキル
- `decks`: ユーザーのデッキ
- `deck_cards`: デッキ内カードと1〜20のスロット
- `user_settings`: ユーザー設定とオンボーディング状態
- `notifications`: ユーザー通知と既読状態
- `card_generation_jobs`: Gemini等のカード生成ジョブと状態
- `storage.card-images`: ユーザー単位で分離した非公開画像バケット
- `cards.trial_public`: 所有者が個別に許可した試し切り用アクションカード（既存カードを含め初期値は非公開）

## Security

全テーブルでRLSを有効化しています。カード、デッキ、画像はログインユーザー本人のデータだけ読み書きできます。試し切り候補APIはサーバー上で`trial_public=true`かつ完成済みアクションのみを選択し、所有者IDや非公開Storageパスを返しません。公開はバインダーからカードごとに許可・撤回できます。新規`auth.users`作成時には`profiles`を自動作成します。

## 接続変数

Webアプリでは以下を設定します。

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-key>
```

`SUPABASE_SERVICE_ROLE_KEY`はブラウザへ公開しないでください。管理処理やWebhookなど、サーバー専用コードからのみ利用します。
