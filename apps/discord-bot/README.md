# LLL Discord Bot

TYPETAの稼働例に合わせ、`main.py`から`keep_alive()`でヘルスチェック用HTTPサーバーを起動し、その後`discord.py`のGateway Botを常駐起動します。DiscordコマンドはExtension/Cogとして分離しています。

## ローカル起動

```bash
cd apps/discord-bot
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .envへ実際の値を設定（コミット禁止）
set -a && . ./.env && set +a
python main.py
```

ヘルスチェックは `http://localhost:${PORT:-10001}/health` です。

`DISCORD_GUILD_ID` を指定すると、開発用ギルドへ即時同期します。未指定の場合はグローバルコマンドとして同期され、Discord側の反映に時間がかかる場合があります。

## 構成

- `main.py`: TYPETA方式の常駐起動入口。health server起動後にBotを起動
- `bot.py`: Bot本体、`cogs/*.py`の自動ロード、Slash Command同期
- `config.py`: `DISCORD_TOKEN` / `TOKEN`と各種環境変数の読込
- `keep_alive.py`: `/`と`/health`を提供するFlaskサーバー
- `cogs/utility_cog.py`: `/ping`のCommand Cog

## 常駐workerでの起動

Workerの起動コマンドを次のいずれかに設定してください。

```bash
python apps/discord-bot/main.py
# またはWorking Directoryをapps/discord-botにして
python main.py
```

Dockerの場合は付属のDockerfileを使えます。

## Vercelについて

TYPETAと同様の`main.py` + `keep_alive.py`構成にしましたが、これは**常駐workerで実行する方式**です。Vercel Functionsはリクエスト単位で実行されるため、Discord Gatewayへ常時接続する`bot.run()`をVercel内で稼働させることはできません。

LLLのVercelには秘密情報を環境変数として登録済みですが、実際のBotはRailway、Render、Fly.io、Cloud Runなどで`python apps/discord-bot/main.py`を起動してください。Vercel側のWebデプロイだけではDiscord Botは起動しません。

VercelだけでSlash Commandを動かす場合は、Python cogsとは別にDiscord Interactions HTTP方式を使います。実装と設定は[`docs/discord-vercel-interactions.md`](../../docs/discord-vercel-interactions.md)を参照してください。HTTP方式ではGateway Botのオンラインpresenceは維持されませんが、署名検証済みの`/ping`リクエストへ応答できます。
