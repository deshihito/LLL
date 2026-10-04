# Discord BotのVercel HTTP方式

## 目的

VercelだけでDiscordの`/ping`を動かすための構成です。Discord Gatewayへ常時接続するPython `discord.py` Botは常駐workerが必要なので、Python cogsは将来のローカル移行用として残し、VercelではDiscord InteractionsのHTTP endpointを使います。

## Endpoint

```text
POST https://<LLLのVercelドメイン>/api/discord/interactions
```

このendpointは以下に対応します。

- Discordの初回PING検証
- Discord署名のEd25519検証
- `/ping`への即時レスポンス

## Vercel環境変数

```text
DISCORD_APPLICATION_ID=<Discord Application ID>
DISCORD_PUBLIC_KEY=<Discord Developer PortalのPublic Key>
```

HTTP方式ではBot tokenをリクエスト処理に使いません。Python cogsをローカルで起動する場合だけ`DISCORD_TOKEN`または`TOKEN`を使います。

## Discord Developer Portal

1. LLLのDiscord Applicationを開く
2. General InformationからPublic Keyを取得する
3. Interactions Endpoint URLへ上記URLを設定する
4. URL検証が成功することを確認する
5. `/ping`のApplication Commandを登録する

`/ping`登録はDiscord RESTまたは既存のPython cogs起動時の`tree.sync()`で行います。既存の`DISCORD_GUILD_ID`を使ったテスト同期を推奨します。

## 自動更新

`vercel.json`のGitデプロイを有効化しました。GitHubのmain更新時にVercelが新しいFunctionをデプロイし、次のInteractionリクエストから最新コードが実行されます。

これはBotユーザーをGateway上でオンラインにする方式ではありません。Discordクライアント上のpresenceは表示されない場合がありますが、Slash Commandは実行できます。
