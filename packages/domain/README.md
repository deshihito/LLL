# Domain package

WebとDiscordの双方で共有する、LLLのゲームルールとドメインモデルの置き場です。

想定構成:

```text
packages/domain/
├── src/
│   ├── card/              # カード定義、カード効果
│   ├── deck/              # デッキ構成と検証
│   ├── game/              # 対戦状態、ターン、勝敗判定
│   ├── effects/           # 効果の評価・適用
│   └── index.ts
└── tests/                 # ルールの決定的なユニットテスト
```

外部SDK、HTTP、Supabase、Discord、ブラウザAPIには依存しない純粋なパッケージを目標にします。
