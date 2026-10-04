# LLL Discord Bot

`discord.py` のExtension/Cog構成で動く、LLL Discord botの最小実行基盤です。現在は `/ping` のみを登録します。

## ローカル起動

```bash
cd apps/discord-bot
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .envへ実際の値を設定（コミット禁止）
set -a && . ./.env && set +a
python bot.py
```

`DISCORD_GUILD_ID` を指定すると、開発用ギルドへ即時同期します。未指定の場合はグローバルコマンドとして同期され、Discord側の反映に時間がかかる場合があります。

## 構成

- `bot.py`: Bot本体、Cogの自動ロード、Slash Command同期
- `cogs/utility_cog.py`: `/ping`のCommand Cog
- `requirements.txt`: `discord.py`依存

## Vercelについて

Discord Gatewayへ常時接続する`discord.py` botは、リクエスト単位で起動・停止するVercel Functionsでは常駐稼働させられません。そのため、Vercelには秘密情報を環境変数として登録し、Webアプリ側のデプロイ環境から利用できる状態を作りますが、Botプロセス自体は常駐worker（Railway、Render、Fly.io、Cloud Runなど）で起動してください。

この制約を無視してVercel Function内で`bot.run()`を呼ぶと、タイムアウト・再起動・Gateway切断が発生します。
