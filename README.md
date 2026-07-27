# 暗号資産スプレッド比較・レバBTC板Depth

次の2種類のレポートを公開APIから作成し、Slackへ投稿します。

[![Orderbook depth](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/orderbook-depth.yml/badge.svg)](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/orderbook-depth.yml)
[![Spread comparison](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/spread-comparison.yml/badge.svg)](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/spread-comparison.yml)

- bitFlyer Crypto CFD (`FX_BTC_JPY`) とGMOコインのレバレッジBTC
  (`BTC_JPY`) の0.1 / 0.3 / 0.5 / 1 / 3 BTC板Depth
- SBIVCの現在取扱銘柄を基準にしたスプレッド比較
  - 現物: SBI VC / bb / bF / CC / GMO / OKJ
  - レバレッジ: SBI VC / bF / GMO

## 実行スケジュール

GitHub Actionsが次の時刻に自動実行します。

- JST 01:00（前日の25:00）
- JST 09:00
- JST 17:00

ワークフローではIANAタイムゾーン `Asia/Tokyo` を指定し、毎日8時間間隔で実行します。GitHub Actionsの混雑状況により、実際の開始が数分以上遅れることがあります。

板Depthは `orderbook-depth.yml`、スプレッド比較は
`spread-comparison.yml` がそれぞれ独立して実行します。

### Watchdog

`.github/workflows/orderbook-depth-watchdog.yml` が毎時 `07 / 17 / 27 / 37 / 47 / 57` 分に直近の定時枠を確認します。定時から20分以上経過しても、その枠の正常完了または実行中の記録がなければ、元の `orderbook-depth.yml` をバックアップ実行します。6時間を超えた古い枠は追いかけません。

スプレッド比較は `spread-comparison-watchdog.yml` が同じ条件を独立して監視します。

正常完了の判定にはGitHub Actionsの実行履歴を利用するため、外部DBや追加Secretは不要です。元ワークフローとバックアップは同じ同時実行グループで直列化され、投稿直前にも同じ枠の成功記録を確認するため、遅延した定時実行との二重投稿を防ぎます。

watchdogの手動実行はデフォルトでdry-runです。Actions画面で `Check only; do not dispatch...` をオフにした場合だけ、未完了枠を実際にバックアップ実行します。

## Slackに表示する内容

### スプレッド比較

Excelの `CompareSheets` と同じ定義で、次の4表を出力します。

- 現物スプレッド
- 現物スプレッド（%）
- レバレッジスプレッド
- レバレッジスプレッド（%）

計算式は `spread = ask - bid`、`mid = (ask + bid) / 2`、
`spread % = spread / mid * 100` です。
現物スプレッド（%）は小数点以下2桁、レバレッジスプレッド（%）は
小数点以下4桁で表示します。

比較行は実行時に
[SBIVC公式サービス概要](https://www.sbivc.co.jp/services/service-overview)
の最初の「現物（販売所）」「レバレッジ（販売所）」表から取得します。
そのため、新規取扱銘柄は自動追加され、デリスト銘柄は自動除外されます。
公式一覧を取得・解析できない場合は、古い固定一覧で投稿せず実行を失敗させます。

`-` は対象外または公式公開2-wayレートなし、`ERR` は取得・応答エラーです。
推測値、最終価格、midを2-wayレートの代用にはしません。現物は各社の販売所
BID/ASK、レバレッジは販売所・店頭CFDのBID/ASKまたは取引所板のbest bid/askを
使用します。
Slack側の長文分割で等幅コードブロックが崩れないよう、4種類の表は
1表ずつ独立したメッセージとして順番に投稿します。

bitFlyer現物は公式販売所画面が利用する認証不要の `price2` エンドポイントを
SBIVCの現行銘柄ごとに呼び出します。このエンドポイントは公式画面で使用されて
いますが、公開API仕様書には掲載されていないため、応答が変わった場合は該当列を
推測で補完せず取得エラーとして扱います。

レバレッジでは、SBI VCの公式2-wayレートと、bF・GMOの板best bid/askを
比較します。GMOは公式Public APIのtickerを使い、現物シンボルとレバレッジの
`_JPY` シンボルを動的に判別します。

### 板Depth

- mid: best askとbest bidの中間値
- SP: best askからbest bidを引いたスプレッドと、mid比のスプレッド率
- price: 指定数量を満たす最後の板価格
- impact: midからpriceまでの不利方向への距離（%）

通常の板表示に合わせ、ask側（成行BUY）を `3 → 1 → 0.5 → 0.3 → 0.1 → best ask`、MIDを挟んでbid側（成行SELL）を `best bid → 0.1 → 0.3 → 0.5 → 1 → 3` の順に表示します。best行のimpactもmidからの距離です。bitFlyerとGMOコインの表示ブロック間には空行を1行入れます。

## Secretの設定

Slack Incoming Webhook URLはコードや設定ファイルへ保存せず、GitHubリポジトリのActions Secretとして登録します。

1. リポジトリの `Settings`
2. `Secrets and variables` → `Actions`
3. `New repository secret`
4. Name: `SLACK_WEBHOOK_URL`
5. Secret: Slack Incoming Webhook URL

Secretの値は公開リポジトリ、Git履歴、Actionsログには表示されません。Webhook URLをコード、Issue、Pull Request、Actions入力欄へ貼り付けないでください。

## 手動実行

リポジトリの `Actions` から `Orderbook depth` または
`Spread comparison` を選び、`Run workflow` で実行できます。

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
npm run spread:dry-run
```

Slackへ投稿:

```bash
npm start
npm run spread
```

テスト:

```bash
npm test
```

最新結果は板Depthが `output/latest.json`、スプレッド比較が
`output/spread-latest.json` に保存されます。このディレクトリと `.env`
はGitから除外されます。

## コード構成

外部I/Oと計算ロジックを分離し、各モジュールを単独でテストできる構成です。

- `src/config.mjs`: 数量、表示順、定時枠などの共有設定
- `src/orderbook.mjs`: 取引所レスポンス変換、板Depth計算、公開API取得
- `src/slack.mjs`: Slack表示生成、Webhook検証、投稿
- `src/application.mjs`: API取得からレポート保存までの実行制御
- `src/report.mjs`: JST表記とJSONレポート
- `src/github-actions.mjs`: GitHub Actions APIクライアント
- `src/watchdog.mjs`: 定時枠、実行履歴分類、復旧判断
- `src/spread-sources.mjs`: SBIVC現行一覧と各社2-wayレートの取得・変換
- `src/spread-comparison.mjs`: スプレッド計算と比較表データ
- `src/spread-slack.mjs`: 4種類のSlack比較表
- `src/spread-application.mjs`: スプレッド取得からレポート保存までの実行制御
- `scripts/`: 通常実行、重複防止、watchdogの薄いエントリーポイント
- `test/`: 計算、I/O境界、watchdog、Workflow設定のテスト

板レベルの正規化とソートは、取引所ごと・BUY/SELLごとに1回だけ行い、その結果を各対象数量の計算で再利用します。

## セキュリティ設計

- 通常ワークフローは `actions: read` と `contents: read` のみ
- watchdogだけが元ワークフローを再起動するための `actions: write` を持つ
- 使用するGitHub公式ActionはフルコミットSHAで固定
- checkout後にGitHub認証情報を残さない
- npm依存パッケージなし
- SecretはSlack投稿ステップだけへ渡す
- watchdogにはSlack Webhook Secretを渡さない
- PR・pushではワークフローを起動しない
- 実行時間を10分で制限
- 同時実行を1件に制限

公開リポジトリのscheduled workflowは、リポジトリ活動が60日間ない場合にGitHubによって自動停止されることがあります。その場合はActions画面から再度有効化してください。

## API

- [bitFlyer Lightning API](https://lightning.bitflyer.com/docs?lang=ja)
- [bitFlyer販売所](https://bitflyer.com/ja-jp/ex/buysell)
- [GMOコイン API](https://api.coin.z.com/docs/)
- [Coincheck価格一覧](https://coincheck.com/ja/exchange/prices)

板は取得直後から変化するため、結果はスナップショットとして扱ってください。手数料・資金調達料・取得後の価格変動は計算に含みません。
