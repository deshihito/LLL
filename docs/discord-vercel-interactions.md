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

Public Keyは、Vercel環境変数`DISCORD_PUBLIC_KEY`を優先し、未設定の場合はBot tokenでDiscord APIからApplication情報を取得して補完します。

## Vercel環境変数

```text
DISCORD_APPLICATION_ID=<Discord Application ID>
DISCORD_TOKEN=<Bot token>
# 任意: 開発用サーバーへ即時同期したい場合
DISCORD_GUILD_ID=<Discord guild ID>
# 任意: 固定Public Keyを使う場合
DISCORD_PUBLIC_KEY=<Discord Developer PortalのPublic Key>
```

## `/ping`の登録

DiscordからInteractions Endpoint URLの検証PINGを受け取った際、Vercel FunctionがDiscord REST APIへ`/ping`を自動登録します。

`DISCORD_GUILD_ID`を指定した場合はギルドコマンドとして即時反映されます。指定しない場合はグローバルコマンドとして登録され、Discord側の反映に時間がかかる場合があります。

## Discord Developer Portal

1. LLLのDiscord Applicationを開く
2. Interactions Endpoint URLへ次のURLを設定する

```text
https://<LLLのVercelドメイン>/api/discord/interactions
```

3. URL検証が成功することを確認する
4. `/ping`が表示されない場合は上記の`/register`を再実行する

## 自動更新

`vercel.json`のGitデプロイを有効化しました。GitHubのmain更新時にVercelが新しいFunctionをデプロイし、次のInteractionリクエストから最新コードが実行されます。

これはBotユーザーをGateway上でオンラインにする方式ではありません。Discordクライアント上のpresenceは表示されない場合がありますが、Slash Commandは実行できます。
