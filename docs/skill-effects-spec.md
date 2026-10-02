# LLL 技効果・条件仕様 v1

## 1. 技オブジェクト

```json
{
  "name": "オーバードライブ",
  "description": "HPが少ない時に攻撃力を高める",
  "skill_type": "active",
  "cost": 50,
  "conditions": {
    "all": [
      { "type": "hp_below", "target": "self", "value": 50 }
    ]
  },
  "effects": [
    { "type": "damage", "target": "enemy_front", "value": 120 },
    { "type": "stat_modifier", "target": "self", "stat": "speed", "value": 20, "duration": 2 }
  ]
}
```

- 1カード最大3技
- `active`のAPコストは50固定
- `passive`のAPコストは0固定
- `passive`はイベント条件を1つ以上含む
- 技名1〜80文字、説明1〜500文字
- 1技あたり効果は1〜6件
- 効果は配列順に実行

## 2. 対象タイプ

`self`, `ally_front`, `ally_support`, `all_allies`, `enemy_front`, `enemy_support`, `all_enemies`, `random_enemy`

## 3. 条件タイプ

`always`, `on_turn_start`, `on_turn_end`, `on_attack`, `on_hit`, `on_damage_taken`, `hp_below`, `hp_above`, `ap_at_least`, `shield_broken`, `part_equipped`, `status_present`, `status_absent`, `turn_at_least`

条件は以下のツリーで表現します。

- `all`: AND
- `any`: OR
- `not`: NOT
- 最大深度3、最大ノード12
- 空の`all`／`any`は禁止

## 4. 効果タイプ

| type | 必須値 | 用途 |
|---|---|---|
| `damage` | target, value | ダメージ |
| `heal` | target, value | HP回復 |
| `stat_modifier` | target, stat, value, duration | max_hp／atk／shield／speed変更 |
| `ap_change` | target=self, value | AP増減 |
| `shield_change` | target, value | シールド付与・破壊 |
| `status_apply` | target, key, duration | 状態付与 |
| `status_remove` | target, key | 状態解除 |
| `equip_part` | target, key | パーツ装着 |
| `unequip_part` | target, key | パーツ解除 |
| `counter` | trigger, target, value, duration | 被ダメージ後の反撃 |
| `follow_up` | trigger, target, value | 命中後の追撃 |

状態キーは`stun`, `burn`, `guard_break`, `overdrive`です。

バフ／デバフは固定値加算です。`duration`は1〜5ターン、同じステータスへの効果は加算します。

## 5. Gemini出力とAPI検証

- enum、対象、条件ツリー、効果構造は厳格検証
- 数値の軽微な超過は範囲内へ丸める
- 技数超過、効果数超過、構造違反は生成失敗
- 検証済みJSONのみ`cards.skills`と`card_skills`へ保存
- `card_skills`には`description`, `conditions`, `effects`, `schema_version`を保存
- 失敗時はgeneration jobを`failed`にして再試行可能にする

## 6. 将来の実行形式

1. バトル状態を読み取る
2. 条件ツリーを評価する
3. 対象を解決する
4. `effects`を配列順に実行する
5. counter／follow_upを予約する
6. 予約効果を最大1段階だけ実行する
7. 状態を確定する
8. イベントログを保存する
9. 勝敗を判定する

実行コンテキストは`battleId`, `eventId`, `turn`, `actorId`, `skillId`, `trigger`, `randomSeed`, `effects`を持つ想定です。同じ`eventId`の二重実行と反撃・追撃の無限連鎖は禁止します。
