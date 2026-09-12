# Web application

プレイヤー向けのWebアプリ置き場です。現時点ではフレームワークや画面実装を追加していません。

想定構成:

```text
apps/web/
├── src/
│   ├── app/             # ルーティング、ページ、レイアウト
│   ├── components/      # Web固有のUI
│   ├── features/        # デッキ、対戦、カード図鑑などの機能単位
│   ├── server/          # Web API / server actions
│   ├── repositories/    # Supabase等の永続化アダプター
│   └── lib/             # Web固有の補助処理
├── public/              # 小さな静的ファイルのみ
└── tests/               # Web単体・画面テスト
```

Web専用のコードはここに置き、ゲームルールは`packages/domain`から利用します。
