# Discord service

Discord上でゲームを補助するBot・コマンド・イベント処理の置き場です。現時点ではDiscord SDKやBot実装を追加していません。

想定構成:

```text
apps/discord/
├── src/
│   ├── commands/         # スラッシュコマンド等
│   ├── events/           # メッセージ・参加・インタラクションイベント
│   ├── use-cases/        # Discordから呼び出すアプリケーション処理
│   ├── repositories/     # Supabase等の永続化アダプター
│   ├── adapters/         # Discord SDKとの境界
│   └── index.ts          # 起動エントリポイント
└── tests/                # コマンド・イベントテスト
```

Discord固有の入出力は`adapters`に閉じ込め、ゲームルールは`packages/domain`を利用します。
