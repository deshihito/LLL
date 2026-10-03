# LLL バトルエンジン・対人戦基盤仕様 v1

## 目的

カード生成後に追加するバトル処理が、カード効果の拡張によって破綻しないように、状態・イベント・実行順・再実行防止を先に固定する。

この文書を基準に、AP・デッキ自動編成・サーバー権威型バトルをruntimeへ実装する。実装済みの追加仕様は末尾の「AP／パーツ／サポート実装補足」を参照する。

## 1. 対象範囲

### v1で扱うもの

- 1対1の対人バトル
- 前衛1体、サポート1体を基本配置
- ターン制
- APを使うactive skill
- 条件で発動するpassive skill
- damage、heal、stat_modifier、AP、shield、status、equip／unequip
- counter、follow_up
- 決定的なイベントログ
- 同一イベントの二重実行防止

### v1で扱わないもの

- CPU戦の高度な思考
- ランキング
- リプレイUI
- 観戦
- 複雑な演出
- Live2D
- Discord Bot
- 途中退出ペナルティの詳細設計
- 課金・報酬・シーズン

## 2. 用語

| 用語 | 定義 |
| --- | --- |
| battle | 1試合の論理単位。`battleId`を持つ |
| player | battleに参加するユーザー。`playerId`を持つ |
| actor | 場に出ているカードまたはパーツ |
| skill | カードに定義された技。元データを直接書き換えない |
| event | 1回の状態変化を表す処理単位 |
| effect | skillまたはpassiveから生成される状態変更命令 |
| snapshot | イベント適用後の正規化されたバトル状態 |

## 3. バトル状態

```ts
interface BattleState {
  battleId: string;
  version: number;
  phase: "waiting" | "active" | "finished" | "aborted";
  turn: number;
  activePlayerId: string;
  players: Record<string, PlayerState>;
  winnerPlayerId: string | null;
  finishReason: "hp_zero" | "surrender" | "timeout" | "disconnect" | null;
  updatedAt: string;
}

interface CardInstance {
  instanceId: string;
  cardId: string;
  cardType: "action" | "part" | "support";
  supportUses?: number;
}

interface PlayerState {
  playerId: string;
  deckId: string;
  actors: ActorState[];
  hand: CardInstance[];
  discard: CardInstance[];
  statuses: StatusState[];
  ready: boolean;
}

interface ActorState {
  instanceId: string;
  cardId: string;
  role: "front" | "support" | "part";
  hp: number;
  maxHp: number;
  atk: number;
  shield: number;
  speed: number;
  ap: number;
  maxAp: number;
  equippedPartIds: string[];
  statuses: StatusState[];
  defeated: boolean;
}

interface StatusState {
  key: "stun" | "burn" | "guard_break" | "overdrive";
  sourceEventId: string;
  remainingTurns: number;
  stacks: number;
}
```

### 状態の原則

- `card_skills`やカード定義は変更しない。
- 試合中の変更は`BattleState`内のactor／player状態だけに適用する。
- `hp`、`ap`、`shield`、`remainingTurns`は整数。
- HPは0未満にしない。
- APは0未満にしない。
- shieldは0未満にしない。
- maxHpを超える回復はmaxHpで丸める。
- defeatedになったactorは新しい行動を開始できない。
- 終了済みbattleに状態変更を適用しない。

## 4. ターン進行

### ターン開始

1. `turn_started`イベントを作成
2. activePlayerIdを確定
3. APをターン開始値へ更新
4. `on_turn_start`条件を評価
5. passive skillをカード定義順に評価
6. effectsを順番に適用
7. statusのターン処理を実行
8. actorの状態を正規化

### 行動

activePlayerだけがactionを送信できる。

```ts
interface BattleAction {
  actionId: string;
  battleId: string;
  expectedVersion: number;
  playerId: string;
  type: "use_skill" | "end_turn" | "surrender" | "play_action" | "equip_part" | "use_support";
  actorInstanceId?: string;
  skillSlot?: number;
  targetInstanceIds?: string[];
  cardInstanceId?: string;
  partInstanceId?: string;
}
```

検証順：

1. battleがactiveか
2. actionIdが未処理か
3. expectedVersionが現在versionと一致するか
4. playerIdがactivePlayerIdと一致するか
5. actorが自分のactorか
6. actorがdefeatedでないか
7. skillSlotが存在するか
8. skillのtargetが許可されているか
9. APが足りるか
10. すべて通過してから1回だけ適用する

### ターン終了

1. `turn_ended`イベントを作成
2. `on_turn_end`条件を評価
3. effectsを適用
4. statusの残りターンを減算
5. defeated状態を確定
6. 勝敗を判定
7. 終了していなければ次のactivePlayerIdへ切り替え
8. turnを加算
9. versionを加算
10. 次の`turn_started`へ進む

## 5. 行動順

初期実装では、activePlayer制で同時行動を扱わない。

将来、同時行動が必要になった場合の予約仕様：

1. speedの高いactorを優先
2. 同値の場合は`instanceId`の辞書順
3. 乱数を使わない
4. 行動順はイベントログに保存

## 6. AP仕様

- active skillはcost 100
- passive skillはcost 0
- 各field actorは初期AP 100を個別に保持し、プレイヤー共有APは持たない
- ターン開始時、そのfield actor自身のSPD分だけAPを加算する（上限1000、defeated actorは加算しない）
- AP未満の場合は拒否
- skill実行開始時にAPを消費
- effects途中で失敗してもAPは戻さない
- AP消費イベントを先にログへ書く
- AP回復効果は`ap_change`で表現する
- APは0未満にならない

- アクションカードは手札から場へ配置でき、場の上限は2枚とする。
- パーツは対応する親アクションへ最大2枚まで装着し、装着後は捨て札へ移す。
- サポートカードは手札から使用し、actorにはならない。使用コストは0 AP。

最大AP、ターン開始時のAP回復量は、現行UIと矛盾しない初期値を実装前に決める。コード側で勝手に複数案を混在させない。

## 7. skill実行パイプライン

技データを直接実行せず、必ず次の順番を通す。

```text
BattleAction
  ↓
ExecutionContext作成
  ↓
conditions評価
  ↓
AP消費
  ↓
effectsを配列順に展開
  ↓
各effectを検証
  ↓
状態へ適用
  ↓
派生イベントをキューへ追加
  ↓
キューを順番に処理
  ↓
状態を正規化
  ↓
勝敗判定
  ↓
イベントログ保存
  ↓
snapshot version更新
```

```ts
interface ExecutionContext {
  battleId: string;
  eventId: string;
  actionId: string;
  turn: number;
  sourcePlayerId: string;
  sourceActorId: string;
  skillSlot: number;
  depth: number;
  stateVersion: number;
}
```

## 8. 条件評価

既存の条件ツリーを使用する。

- `all`: すべてtrue
- `any`: 1つ以上true
- `not`: 子条件の反転
- 最大深度3
- 最大ノード数12
- 評価は副作用を持たない
- 条件評価中にstateを変更しない

### 条件の対象

- self
- ally_front
- ally_support
- all_allies
- enemy_front
- enemy_support
- all_enemies
- random_enemy

`random_enemy`はv1では、乱数シードをExecutionContextに含めない限り使用禁止とする。再現性を優先する。

## 9. effect実行

`effects`配列の順番を必ず維持する。

### 基本効果

- damage：targetのshieldを先に減らし、残りをhpへ適用
- heal：maxHpを超えない
- stat_modifier：固定値加算。割合変更なし
- ap_change：selfのみ。0未満にならない
- shield_change：0未満にならない

### 状態異常

- status_apply：同じkeyがある場合は初期v1ではremainingTurnsを長い方へ更新
- status_remove：対象keyをすべて解除
- statusの重複stack仕様はv1では`stacks = 1`固定
- burnなどのtickダメージは`turn_started`または`turn_ended`のどちらかに統一する。実装前に決定し、混在させない

### パーツ

- equip_part：対象actorのequippedPartIdsへ追加
- unequip_part：存在する場合のみ削除
- 同じpartの重複装着は禁止
- パーツによるstat変化は、装着時に計算するか派生値で計算するかを統一する

## 10. counter／follow_up

- counterのtriggerは`on_damage_taken`
- follow_upのtriggerは`on_hit`
- 派生イベントには親eventIdを持たせる
- 同一event chain内でcounterがcounterを発生させない
- 同一event chain内でfollow_upがfollow_upを無限発生させない
- 派生イベントの最大深度は3
- 深度超過時は効果を捨て、`effect_skipped`をログへ残す
- counter／follow_upの発生順は、元effect完了後にキュー順で処理する

## 11. イベントログ

```ts
interface BattleEvent {
  eventId: string;
  battleId: string;
  actionId: string;
  parentEventId: string | null;
  turn: number;
  sequence: number;
  type:
    | "turn_started"
    | "turn_ended"
    | "action_accepted"
    | "action_rejected"
    | "ap_changed"
    | "damage_applied"
    | "heal_applied"
    | "stat_changed"
    | "shield_changed"
    | "status_applied"
    | "status_removed"
    | "part_equipped"
    | "part_unequipped"
    | "counter_triggered"
    | "follow_up_triggered"
    | "actor_defeated"
    | "battle_finished"
    | "effect_skipped";
  sourceActorId: string | null;
  targetActorIds: string[];
  payload: Record<string, string | number | boolean | null>;
  stateVersionBefore: number;
  stateVersionAfter: number;
  createdAt: string;
}
```

イベントログは後から再生可能な情報を持たせる。ただし、v1ではリプレイUIは作らない。

## 12. 冪等性と競合防止

- `actionId`はクライアントが生成するが、サーバーで一意性を検証する
- 同じactionIdを2回適用しない
- `expectedVersion`が古いactionは拒否する
- 状態更新はトランザクションまたは楽観ロックで保護する
- Realtime通知は状態更新後に発行する
- 通知受信を状態更新の根拠にしない
- クライアントから送られたHP、AP、damage、winnerは信用しない

## 13. 終了条件

以下のいずれかでbattleを`finished`にする。

- 勝敗判定で相手の必要actorが全滅
- surrender
- timeout
- disconnectの既定時間超過

winnerPlayerIdとfinishReasonを同じ確定イベントで保存する。
終了後のactionはすべて拒否する。

## 14. 対人戦のDB設計方針

将来追加するテーブル候補：

```text
battles
battle_players
battle_actions
battle_events
battle_snapshots
```

Realtimeで直接JSONを正としない。

- 正となる状態：サーバーが検証したbattle snapshot
- 監査・再現用：battle_events
- クライアント送信：battle_actions
- Realtime：更新通知の配信手段

## 15. 実装前に確認が必要な未確定項目

次の値は実装前にプロダクト仕様として決定する。

1. 初期AP
2. 最大AP
3. ターンごとのAP回復量
4. 先攻プレイヤーの決定方法
5. 前衛が倒れた場合の交代ルール
6. サポートカードの行動可否
7. burn等のtickタイミング
8. shieldへのdamage軽減方式
9. timeout秒数
10. disconnect後の猶予秒数
11. surrender可能タイミング
12. 20枚デッキ内のaction／part／support比率

これらを勝手に決めてコードへ埋め込まない。未確定のまま実装する場合は、設定値として一箇所へ集約し、PR本文に明記する。

## 16. 今後の実装順

```text
カード詳細
  ↓
デッキ編成
  ↓
デッキ妥当性チェック
  ↓
バトル状態の単体テスト
  ↓
CPU用ローカル実行
  ↓
マッチングDB
  ↓
battles／actions／eventsのSQL
  ↓
サーバー側action検証
  ↓
Realtime通知
  ↓
切断・再接続
```

## 17. 今回の完了条件

- この仕様書がPRに含まれている
- 実行順、状態、効果、イベントログ、冪等性が明文化されている
- 未確定のゲームルールが一覧化されている
- Runtimeコードに変更がない
- 画像解析、Gemini、カード生成APIに変更がない

---


## AP／パーツ／サポート実装補足（2026-10-03）

- アクションの各actorは独立したAPを持ち、初期値100、上限1000。プレイヤー共有APはない。active skillは100、passive skillは0。ターン開始時に生存actor自身のSPD分を加算する。
- デッキ保存では選択済みアクションごとにreadyな子パーツを `created_at ASC, id ASC` で最大2枚自動追加する。アクション最大5枚、パーツを含め最大20枚。パーツ単体の追加・並び替えは不可。
- supportは場のactorではなく手札カード。**個別APの支払元が存在しないため、ユーザー確認によりsupportの使用コストは0 AP** とする。プレイヤー共有APは導入しない。`SUPPORT_CONFIG.defaultCost`を唯一のアプリ側既定値にし、DB schema validatorも0 APを検証する。
- supportは `on_play`、server-side conditions／target scope検証、最大使用回数、配列順effects、使用成功時だけdiscardをsnapshot上で処理する。definition JSONはbattle state APIから返さない。内部のvalidatorと不変な条件判定はserver roleだけが実行する。
- この補足のDB migrationは `20261003020000_ap_support_deck.sql`。適用順は `20261003010000_card_scout_tier.sql` の後。
