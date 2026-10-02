# Web application (LLL Portal)

動的カードゲーム **LLL** のプレイヤー向けポータルWebアプリケーションです。
Next.js (App Router), Tailwind CSS, Auth.js (NextAuth v5) を採用し、最小限の構成でGoogle連携・Discord連携のアカウント認証およびポータル画面を提供します。

## 機能
- **Google アカウント連携 / ログイン**: Google OAuth 2.0 / OIDC
- **Discord アカウント連携 / ログイン**: Discord OAuth 2.0
- **ポータル画面 (`/`)**: アカウントの連携ステータス、プレイヤー情報、サインアウト機能
- **ログイン画面 (`/login`)**: Google / Discord 連携ボタン

## 環境変数の設定

`.env.example` をコピーして `.env` を作成し、各サービスで発行された認証情報を設定してください。

```bash
cp .env.example .env
```

### 設定項目
| 変数名 | 説明 | 取得先 / 設定例 |
|---|---|---|
| `AUTH_SECRET` | NextAuth暗号化キー | `openssl rand -base64 33` 等で生成 |
| `AUTH_URL` | アプリケーションのBase URL | ローカル開発時は `http://localhost:3000` |
| `AUTH_GOOGLE_ID` | Google OAuth クライアントID | [Google Cloud Console](https://console.cloud.google.com/) |
| `AUTH_GOOGLE_SECRET` | Google OAuth クライアントシークレット | 同上 |
| `AUTH_DISCORD_ID` | Discord Application Client ID | [Discord Developer Portal](https://discord.com/developers/applications) |
| `AUTH_DISCORD_SECRET` | Discord Application Client Secret | 同上 |

#### コールバックURLの登録
Google Cloud Console および Discord Developer Portal にて、以下のリダイレクトURI（コールバックURL）を許可リストに追加してください：
- Google: `http://localhost:3000/api/auth/callback/google` (本番ドメインに合わせて変更)
- Discord: `http://localhost:3000/api/auth/callback/discord` (本番ドメインに合わせて変更)

## ローカル開発手順

ルートディレクトリまたは `apps/web` ディレクトリで以下のコマンドを実行します。

```bash
# ルートから起動する場合
pnpm dev:web

# apps/web ディレクトリから直接起動する場合
cd apps/web
pnpm dev
```

起動後、ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスしてください。

## ビルド

```bash
pnpm --filter web build
```
