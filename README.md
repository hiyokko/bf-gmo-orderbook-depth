# 暗号資産スプレッド比較・レバBTC板Depth・Polymarket

次の3種類のレポートを公開APIから作成し、Slackへ投稿します。

[![Orderbook depth](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/orderbook-depth.yml/badge.svg)](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/orderbook-depth.yml)
[![Spread comparison](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/spread-comparison.yml/badge.svg)](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/spread-comparison.yml)
[![Polymarket CLARITY Act](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/clarity-act.yml/badge.svg)](https://github.com/hiyokko/bf-gmo-orderbook-depth/actions/workflows/clarity-act.yml)

- bitFlyer Crypto CFD (`FX_BTC_JPY`) とGMOコインのレバレッジBTC
  (`BTC_JPY`) の0.1 / 0.3 / 0.5 / 1 / 3 BTC板Depth
- SBIVCの現在取扱銘柄を基準にしたスプレッド比較
  - 現物: SBI VC / bb / bF / CC / GMO / OKJ
  - レバレッジ: SBI VC / bF / GMO
- Polymarketの「CLARITY Actが2026年に署名・成立する」YES確率と推移

## 実行スケジュール

GitHub Actionsが次の時刻に自動実行します。

- JST 01:00（前日の25:00）
- JST 09:00
- JST 17:00

ワークフローではIANAタイムゾーン `Asia/Tokyo` を指定し、毎日8時間間隔で実行します。GitHub Actionsの混雑状況により、実際の開始が数分以上遅れることがあります。

板Depthは `orderbook-depth.yml`、スプレッド比較は
`spread-comparison.yml`、CLARITY Actは `clarity-act.yml` が
それぞれ独立して実行します。
定時実行とwatchdog復旧では、スプレッド比較が同じ定時枠の板Depth成功を
確認し、CLARITY Actがスプレッド比較の成功を確認してから投稿します。
Slack上の順番は必ず
「板Depth → スプレッド比較 → Polymarket CLARITY Act」になります。
手動テストはそれぞれ単独で実行できます。

### Watchdog

`.github/workflows/report-watchdog.yml` が毎時 `07 / 17 / 27 / 37 / 47 / 57` 分に直近の定時枠を確認します。定時から20分以上経過しても、その枠の正常完了または実行中の記録がなければ、3種類のレポートのうち未完了のものだけをバックアップ実行します。6時間を超えた古い枠は追いかけません。

2種類のレポートは個別に判定・再実行されるため、片方の確認やdispatchが
失敗しても、もう片方の復旧処理は継続します。

正常完了の判定にはGitHub Actionsの実行履歴を利用するため、外部DBや追加Secretは不要です。元ワークフローとバックアップは同じ同時実行グループで直列化され、投稿直前にも同じ枠の成功記録を確認するため、遅延した定時実行との二重投稿を防ぎます。

watchdogの手動実行はデフォルトでdry-runです。Actions画面で `Check only; do not dispatch...` をオフにした場合だけ、未完了枠を実際にバックアップ実行します。

## Slackに表示する内容

### Polymarket CLARITY Act

[対象市場](https://polymarket.com/ja/event/clarity-act-signed-into-law-in-2026)
の現在のYES確率、24時間変化、市場開始以来の確率推移を表示します。
市場情報とYESトークンはPolymarket公式Gamma API、履歴は公式CLOB APIから
取得します。全期間は日次、直近1ヶ月は6時間、直近1週間は1時間粒度で
履歴を取得し、各期間を最大60点へ均等間引きします。
QuickChartで0〜100%の縦軸付き画像を生成して同じSlack投稿へ載せます。
各データ点は平滑化せず、実測値を直線で結びます。
短縮URLやAPIキーは使わず、各画像URLはSlackの3,000文字制限に余裕を
持たせた2,000文字未満に収めます。Slackで安定して表示できるよう、
出力画像は900×460pxに固定します。
QuickChartが応答しない場合は、該当期間だけ縦軸付きのUnicode面チャート
へ自動的にフォールバックします。
チャート外には各期間と24時間の相対変化率を表示し、確率ポイント差も
併記します。
1ヶ月・1週間の詳細履歴APIだけが失敗した場合は、全期間の日次履歴から
該当期間を切り出して投稿を継続します。
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
比較します。GMO現物は公式販売所画面が利用する認証不要のレートフィード、
GMOレバレッジは公式Public API tickerの `_JPY` シンボルを使用します。
販売所フィードは公開API仕様書に掲載されていないため、応答が変わった場合は
取引所価格で補完せず取得エラーとして扱います。

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

リポジトリの `Actions` から `Orderbook depth`、`Spread comparison`、
または `Polymarket CLARITY Act` を選び、`Run workflow` で実行できます。

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
npm run clarity:dry-run
```

Slackへ投稿:

```bash
npm start
npm run spread
npm run clarity
```

テスト:

```bash
npm test
```

最新結果は板Depthが `output/latest.json`、スプレッド比較が
`output/spread-latest.json`、CLARITY Actが
`output/clarity-latest.json` に保存されます。このディレクトリと `.env`
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
- `src/watchdog-application.mjs`: 2レポートの独立した監視・復旧制御
- `src/report-order.mjs`: スプレッド投稿前の板Depth完了待機
- `src/polymarket.mjs`: CLARITY市場・YESトークン・価格履歴の取得
- `src/clarity-metrics.mjs`: 期間・24時間の変化率計算
- `src/clarity-periods.mjs`: 全期間・1ヶ月・1週間の履歴抽出
- `src/clarity-chart.mjs`: JSON用Unicode確率チャート
- `src/clarity-quickchart.mjs`: QuickChart画像URLと事前確認
- `src/clarity-slack.mjs`: CLARITY ActのBlock Kit表示
- `src/clarity-application.mjs`: CLARITYレポートの実行制御
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
- [Polymarket API](https://docs.polymarket.com/)

板は取得直後から変化するため、結果はスナップショットとして扱ってください。手数料・資金調達料・取得後の価格変動は計算に含みません。
