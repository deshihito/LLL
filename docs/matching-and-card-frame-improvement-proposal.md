# マッチング・カード選択・カードフレーム改善案

## 1. 対象となる問題

今回の改善対象は次の3点です。

1. **マッチングのキャンセルに失敗する**
2. **戦闘中のカード選択で×ボタンを押しても閉じない**
3. **カード詳細や説明がカードの外側に出ており、カード単体で完結していない**

いずれも、画面外の状態とカード・マッチングUIの状態が分離していることが原因です。

---

## 2. マッチングキャンセルの改善案

### 2.1 現状の問題点

クライアントは以下の処理を同時に行っています。

- `cancelMatch` から `DELETE /api/matchmaking` を送信
- マッチング中は約2.5秒ごとに `GET /api/matchmaking` をポーリング
- 初回マッチング開始直後にもポーリングが開始される
- ポーリング結果を受けて `queueing` を更新する

この構造では、キャンセルリクエストとポーリングが競合する可能性があります。

```text
キャンセルをクリック
  ├─ DELETE が送信される
  └─ 同時に GET ポーリングが返る
       └─ まだ queued を返す
            └─ queueing が再び true に見える
```

また、DB関数自体は `status = 'queued'` の行だけを `cancelled` に変更するため、以下の場合には見た目上キャンセルできないことがあります。

- すでに `matched` になっている
- キューの状態が画面とDBでずれている
- キャンセル処理中に対戦相手が見つかった
- マイグレーションが適用されておらず、RPCが存在しない
- RPCエラーの詳細がクライアントに返らず、原因が分からない

### 2.2 推奨するクライアント修正

#### キャンセル中フラグを追加

`cancelingMatch` を追加し、キャンセル中は以下を行います。

- キャンセルボタンを無効化
- 「キャンセル中…」に表示変更
- 新しいポーリング結果をUIへ反映しない
- キャンセル完了までマッチング画面を維持

#### ポーリングをAbortControllerで停止

マッチングポーリング用の `AbortController` を保持し、キャンセル時に中断します。

```text
cancelMatch()
  1. cancelingMatch = true
  2. polling controller を abort
  3. DELETE を実行
  4. GET で最終状態を確認
  5. cancelled または null を確認
  6. queueing = false
  7. cancelingMatch = false
```

#### リクエスト世代番号を持つ

キャンセル前に発行された古いポーリングのレスポンスを無視するため、`queueRequestVersion` を持たせます。

```ts
const requestVersion = ++queueRequestVersionRef.current;
const result = await pollQueue();
if (requestVersion !== queueRequestVersionRef.current) return;
```

これにより、キャンセル後に古い `queued` レスポンスが状態を巻き戻すことを防ぎます。

#### matched状態をキャンセル扱いにしない

キャンセルリクエストの最中に `matched` へ進んだ場合、キャンセル成功と偽装してはいけません。

```text
queued       → cancelled に変更可能
matched      → バトル開始済みなのでキャンセル不可
expired      → すでに終了
cancelled    → キャンセル済み
```

`matched` を検出した場合は、対戦画面へ遷移するか、「すでに対戦相手が見つかったためキャンセルできませんでした」と表示します。

### 2.3 推奨するAPI・DB修正

#### DELETEを冪等にする

DELETEを複数回呼んでも安全にします。

- queued：cancelledへ更新
- cancelled：成功として返す
- expired：成功として返す
- matched：409相当でキャンセル不可
- 行なし：すでに終了済みとして成功扱い

#### APIレスポンスを明確化

現在の `{ ok: true }` だけでなく、次のように返します。

```json
{
  "ok": true,
  "status": "cancelled",
  "cancelled": true
}
```

キャンセルできない場合は、クライアントで原因を表示できる形式にします。

```json
{
  "ok": false,
  "status": "matched",
  "errorCode": "MATCH_ALREADY_FOUND"
}
```

#### RPCの存在確認・マイグレーション確認

`cancel_matchmaking` はSQLマイグレーションで定義されていますが、環境へ最新マイグレーションが適用されていない場合、APIは500になります。

デプロイ時に以下を確認できるチェックを追加します。

- `cancel_matchmaking(uuid)` が存在する
- `matchmaking_queue` のstatus制約が最新である
- RPCがservice roleから実行可能である
- `matchmake_and_create_battle` と同じロック戦略を利用している

### 2.4 UI改善

- 「検索をキャンセル」ボタンを「キャンセル」に短縮
- 押下直後にボタンを無効化
- スピナーと「キャンセル中…」を表示
- 成功後は「マッチングをキャンセルしました」
- 失敗時は「対戦相手が見つかったためキャンセルできません」など原因を表示
- 画面がキャンセル前の「検索中」に戻らないことを保証

---

## 3. カード選択の×ボタンが閉じない問題

### 3.1 最も可能性の高い原因

試し切り画面では、選択中カードが次のように取得されています。

```ts
const selectedActor =
  playerActors.find((item) => item.instanceId === selectedActorId) ?? actor;
```

×ボタンで `setSelectedActorId(null)` を呼んでも、`selectedActorId` がnullになった直後に `actor` がフォールバックされます。

その結果、次の状態になります。

```text
×を押す
  → selectedActorId = null
  → selectedActor が actor に戻る
  → モーダルが再描画される
```

つまり、×ボタンのイベント自体は発火していても、表示条件が常に真になるため、ユーザーからは閉じないように見えます。

### 3.2 状態を明確に分離する

`activeActor` と `selectedActor` を分離します。

```ts
const activeActor = playerActors.find((item) => item.instanceId === actorId);
const selectedActor = selectedActorId
  ? playerActors.find((item) => item.instanceId === selectedActorId) ?? null
  : null;
```

モーダルの表示条件は必ず `selectedActor !== null` にします。

```tsx
{selectedActor && (
  <TrialCardActionModal
    actor={selectedActor}
    onClose={() => setSelectedActorId(null)}
  />
)}
```

これにより、×ボタン・背景クリック・Escapeキーのいずれでも確実に閉じられます。

### 3.3 ×ボタンの操作信頼性を上げる

次の対策を共通のカード詳細ステージへ追加します。

- `<button type="button">` を明示
- `onPointerDown` でもイベント伝播を停止
- `onClick` でもイベント伝播を停止
- `pointer-events: auto` を明示
- `z-index` をカード本体より上に設定
- タップ領域を最低44pxに拡大
- `aria-label` を維持
- `Escape` キーで閉じる
- 背景クリックでも閉じる
- モーダル表示中は背面スクロールを停止

### 3.4 対人戦と試し切りの共通化

現在は対人戦と試し切りで似たモーダルが別々に存在します。

改善案では、以下を共通コンポーネントにします。

```text
BattleCardStage
 ├─ CardFrame
 ├─ CardDetails
 ├─ CardSkills
 ├─ CardStateBadge
 ├─ CardActionArea
 └─ CloseButton
```

これにより、片方だけ閉じる挙動が違う問題を防ぎます。

---

## 4. カード単体で完結する情報設計

### 4.1 現状の問題

現在は、カード本体に以下の情報が十分に入っていません。

- 説明文
- 技の詳細
- APコスト
- 使用可能状態
- カードの現在ゾーン
- パーツ装着状態
- 破壊・使用済み状態

そのため、カードの横に別の説明UIを置く必要があり、画面全体が複雑になります。

### 4.2 改善後のカード構造

カードを拡大したとき、カード単体のフレーム内に情報を収めます。

```text
┌────────────────────┐
│ ACTION / AP 3      │
│                    │
│      カード画像     │
│                    │
│ カード名            │
│ HP 120  ATK 80     │
│ DEF 40   SPD 60    │
├────────────────────┤
│ CARD TEXT           │
│ カード説明文        │
├────────────────────┤
│ SKILLS             │
│ 技1  効果   2 AP   │
│ 技2  効果   4 AP   │
├────────────────────┤
│ HAND / READY       │
└────────────────────┘
```

モーダルの外側にタイトル・説明・技を置くのではなく、拡大されたカードフレームの内部にまとめます。

### 4.3 CardDisplayの拡張

既存の `CardDisplay` を単なる画像表示コンポーネントから、カードの表面を表現するコンポーネントへ拡張します。

推奨props：

```ts
type CardFrameProps = {
  card: DisplayCard;
  skills?: CardSkill[];
  cardState?: CardPresentationState;
  ap?: number;
  maxAp?: number;
  zone?: "hand" | "field" | "discard" | "destroyed";
  showDescription?: boolean;
  showSkills?: boolean;
  interactive?: boolean;
  onSkillSelect?: (slot: number) => void;
};
```

### 4.4 サイズ別の情報量

すべての情報を常に小さい手札カードへ詰め込むのではなく、サイズごとに段階表示します。

| サイズ | 表示内容 |
|---|---|
| small | アート、タイプ、カード名、状態バッジ |
| medium | アート、カード名、基本能力、短い説明 |
| large | 説明全文、技、AP、状態、操作ボタン |

これにより、通常時の手札は見やすく、選択時だけカード単体で完結できます。

### 4.5 技の選択もカード内部へ

技のボタンをカード外のパネルに置くのではなく、カードフレームの下部に配置します。

- 使用可能技：明るいボタン
- AP不足：AP表示を赤くしてdisabled
- パッシブ：自動バッジ
- 使用済み：技領域全体を抑制
- ターン外：カード表面に「相手のターン」表示

カードを拡大したときに、ユーザーが別の説明を探さなくてよい状態を目標にします。

---

## 5. 推奨実装順

### Phase 1：バグ修正

最初に動作不良を直します。

1. 試し切りの `selectedActor` フォールバックを修正
2. 対人戦・試し切りの×ボタンを共通閉じる処理へ変更
3. Escapeキー、背景クリック、44pxタップ領域を追加
4. マッチングキャンセル中の状態を追加
5. ポーリングのAbortControllerとリクエスト世代管理を追加
6. DELETE APIの状態別レスポンスを追加

### Phase 2：カードフレーム統合

1. `CardDisplay` に説明領域を追加
2. 技領域をカード下部へ移動
3. 状態バッジをカード内に統合
4. 対人戦・試し切りで同じカードステージを使用
5. 外側の重複タイトル・説明・技パネルを削除

### Phase 3：カード表現

1. カードフレーム内を上部・アート・説明・技・状態に分割
2. CSS 3Dの厚み・影・反射をカード全体へ適用
3. カードを拡大したときに情報が読みやすくなるアニメーションを追加
4. スマホではカードフレームを縦スクロール可能にする
5. reduced-motion時は静的表示へ切り替える

---

## 6. 完了条件

### マッチング

- キャンセルを1回押すだけで検索状態が終了する
- キャンセル中にボタンを連打できない
- 古いポーリング結果で検索状態へ戻らない
- matched状態の場合は正しいメッセージが出る
- API失敗時に原因が表示される

### カード選択

- 対人戦で×を押すと必ず閉じる
- 試し切りで×を押すと必ず閉じる
- 背景クリックで閉じる
- Escapeキーで閉じる
- モーダルを閉じた直後に再表示されない

### カード単体完結

- 拡大カード内にカード名がある
- 拡大カード内に説明がある
- 拡大カード内に能力値がある
- 拡大カード内に技とAPがある
- 使用済み・破壊済み・手札などの状態がカード内にある
- カード外の重複説明を削除できる
- スマホでもカード内情報が読める

---

## 7. 推奨判断

**3つとも修正すべきです。** 優先順位は以下です。

1. 試し切りの×ボタンが閉じないフォールバックバグ
2. マッチングキャンセルとポーリングの競合
3. カードフレーム内への情報統合

特に3つ目は単なる装飾改善ではなく、ゲームの操作モデルに関わります。

> **カードを開けば、カードに関する判断がすべて完了する。**

この状態にすると、カードゲームとしての理解が早くなり、画面外の説明パネルや常設コマンドを減らせます。
