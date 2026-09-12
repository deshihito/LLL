# Supabase placeholder

将来、Supabaseを採用する段階で以下を追加します。

```text
infra/supabase/
├── migrations/        # DBマイグレーション
├── functions/         # Edge Functions（必要な場合のみ）
├── seed/              # 開発用シード（必要な場合のみ）
└── config.toml        # ローカル開発設定（必要な場合のみ）
```

**現時点ではSupabaseプロジェクト、スキーマ、マイグレーション、接続コードは作成していません。**
