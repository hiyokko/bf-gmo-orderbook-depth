# bitFlyer・GMOコイン レバBTC板Depth

bitFlyer Crypto CFD (`FX_BTC_JPY`) とGMOコインのレバレッジBTC (`BTC_JPY`) の公開板APIから、0.1 / 0.3 / 0.5 / 1 / 3 BTCの板Depthを計算し、Slackへ投稿します。

[![Orderbook depth](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/orderbook-depth.yml/badge.svg)](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/orderbook-depth.yml)

## 実行スケジュール

GitHub Actionsが次の時刻に自動実行します。

- JST 01:00（前日の25:00）
- JST 09:00
- JST 17:00

ワークフローではIANAタイムゾーン `Asia/Tokyo` を指定し、毎日8時間間隔で実行します。GitHub Actionsの混雑状況により、実際の開始が数分以上遅れることがあります。

## Slackに表示する内容

- 到達価格: 指定数量を満たす最後の板価格
- VWAP: 板を指定数量まで消費した場合の加重平均価格
- 価格影響: 最良気配に対するVWAPの不利方向への乖離（bpと%を併記）

通常の板表示に合わせ、ask側（成行BUY）を `3 → 1 → 0.5 → 0.3 → 0.1`、bestを挟んでbid側（成行SELL）を `0.1 → 0.3 → 0.5 → 1 → 3` の順に表示します。bitFlyerとGMOコインの表示ブロック間には空行を1行入れます。

## Secretの設定

Slack Incoming Webhook URLはコードや設定ファイルへ保存せず、GitHubリポジトリのActions Secretとして登録します。

1. リポジトリの `Settings`
2. `Secrets and variables` → `Actions`
3. `New repository secret`
4. Name: `SLACK_WEBHOOK_URL`
5. Secret: Slack Incoming Webhook URL

Secretの値は公開リポジトリ、Git履歴、Actionsログには表示されません。Webhook URLをコード、Issue、Pull Request、Actions入力欄へ貼り付けないでください。

## 手動実行

リポジトリの `Actions` → `Orderbook depth` → `Run workflow` から実行できます。

- `Post result to Slack` がオフ: API取得と計算だけを実行
- `Post result to Slack` がオン: Slackへテスト投稿

Pull Requestやpushイベントからは起動しないため、外部コントリビューターのコードでSecretを使用することはありません。

## ローカル実行

Node.js 24以降が必要です。

```bash
cp .env.example .env
chmod 600 .env
```

`.env` の `SLACK_WEBHOOK_URL` を実際のWebhook URLへ置き換えます。

投稿なし:

```bash
npm run dry-run
```

Slackへ投稿:

```bash
npm start
```

テスト:

```bash
npm test
```

最新結果は `output/latest.json` に保存されます。このディレクトリと `.env` はGitから除外されます。

## セキュリティ設計

- ワークフロー権限は `contents: read` のみ
- 使用するGitHub公式ActionはフルコミットSHAで固定
- checkout後にGitHub認証情報を残さない
- npm依存パッケージなし
- SecretはSlack投稿ステップだけへ渡す
- PR・pushではワークフローを起動しない
- 実行時間を10分で制限
- 同時実行を1件に制限

公開リポジトリのscheduled workflowは、リポジトリ活動が60日間ない場合にGitHubによって自動停止されることがあります。その場合はActions画面から再度有効化してください。

## API

- [bitFlyer Lightning API](https://lightning.bitflyer.com/docs?lang=ja)
- [GMOコイン API](https://api.coin.z.com/docs/)

板は取得直後から変化するため、結果はスナップショットとして扱ってください。手数料・資金調達料・取得後の価格変動は計算に含みません。
