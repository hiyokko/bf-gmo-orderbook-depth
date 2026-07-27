# AGENTS.md

## Scope

These instructions apply to the repository root and all descendants.

## Project rules

- Keep the repository safe for public visibility.
- Use `FX_BTC_JPY` for bitFlyer Crypto CFD and `BTC_JPY` for GMO Coin leveraged BTC.
- Calculate BUY depth by consuming asks in ascending price order.
- Calculate SELL depth by consuming bids in descending price order.
- Keep target quantities at 0.1, 0.3, 0.5, 1, and 3 BTC unless the user requests a change.
- Display ask/BUY rows as 3, 1, 0.5, 0.3, 0.1 BTC, then best ask toward MID.
  After MID, display best bid, then bid/SELL rows as 0.1, 0.3, 0.5, 1, 3 BTC.
- Calculate and display best ask/bid impact as the percentage distance from MID.
- Calculate impact from `mid = (bestAsk + bestBid) / 2`.
- Display arrival-price impact as a percentage.
- Use `impact = midからpriceまでの距離` as the Slack methodology caption.
- Label the table columns `amount`, `price`, and `impact`.
- Display the mid price, `SP = bestAsk - bestBid`, and the percentage
  `SP / MID * 100` on one line between horizontal separator lines, formatted
  as `MID ...（SP ...／...%）`.
- Place the table header directly below ASK/BUY, and place the repeated table
  header and BID/SELL label below the SELL rows so the layout mirrors around MID.
- Do not display fetch or exchange API response timestamps in Slack.
- Align Slack table columns to Slack's rendered code-block font, treating
  Japanese characters as 1.5 ASCII character widths.
- Separate the bitFlyer and GMO Coin Slack blocks with one blank line.
- Keep the GitHub Actions schedule at JST 01:00, 09:00, and 17:00 daily, representing the requested 09:00, 17:00, and 25:00 cycle.
- Keep the watchdog recovery window at 20–360 minutes after the latest scheduled slot, and do not treat ordinary manual runs as slot completion.
- Build spread-comparison rows from the current `現物（販売所）` and
  `レバレッジ（販売所）` tables on the official SBIVC service-overview page at
  runtime. Do not fall back to a stale hard-coded symbol list when the official
  listing page cannot be parsed.
- Fetch bitFlyer spot dealer quotes for each current SBIVC symbol from the
  official Buy/Sell page's unauthenticated `api/app/market/price2` endpoint.
  Do not use the BTC-only Echo API for the multi-asset comparison.
- Display spot dealer-spread columns in this order: SBI VC, bF, CC, GMO, bb,
  OKJ. Do not display BPJ or CT columns. Display leverage columns in this
  order: SBI VC, bF, GMO, SBI FX, RW, FXTF.
- Use best bid/ask for leverage exchange orderbooks (GMO and Rakuten Wallet)
  and the official two-way dealer quotes for leverage OTC/CFD venues.
- Fetch GMO spot and leverage best bid/ask from its documented public ticker
  endpoint, using plain symbols for spot and `_JPY` symbols for leverage.
- Discover enabled personal JPY CFD products from Rakuten Wallet's public
  symbol endpoint at runtime, respect its 200 ms public-API interval, and fetch
  each matching SBIVC leverage symbol's best bid/ask from its orderbook.
- Fetch SBI FX Trade's BTC/JPY, XRP/JPY, and ETH/JPY quotes from the official
  public website feed, and FXTF's BTC/JPY and ETH/JPY quotes from the official
  public real-time-rate feed.
- Calculate spread as `ask - bid`, mid as `(ask + bid) / 2`, and spread
  percentage as `(ask - bid) / mid * 100`.
- Display spot spread percentages with two decimal places. Keep leverage spread
  percentages at four decimal places.
- In Slack, place one blank line between the spread-comparison title and the
  first table. Do not display a separate spread-formula caption.
- Never substitute mids, last prices, or inferred values for an unavailable
  two-way quote. Display such cells as `-`.
- Post each of the four spread-comparison tables as an independent Slack
  message below 4,000 characters so Slack cannot split a code fence.
- Keep the spread-comparison schedule and its watchdog separate from the
  orderbook-depth workflow so either report can recover independently.
- Keep calculation, external I/O, orchestration, and CLI entry points in separate modules under `src/` and `scripts/`.
- Normalize and sort each exchange side once before calculating all configured target quantities.
- Run `npm test`, `npm run dry-run`, and `npm run spread:dry-run` after code or workflow changes.

## Public-repository security

- Store the Slack Incoming Webhook URL only in the GitHub Actions repository secret named `SLACK_WEBHOOK_URL`.
- For local execution, `.env` may contain `SLACK_WEBHOOK_URL`, but it must remain Git-ignored with owner-only permissions.
- Never print, commit, upload, document, or place the Webhook URL in workflow inputs.
- Never trigger a secret-bearing workflow from pull requests or untrusted code.
- Give `GITHUB_TOKEN` read-only contents permission.
- Limit `actions: write` to watchdog workflows that dispatch their primary workflow.
- Pin every referenced GitHub Action to a full-length commit SHA.
- Pass the Slack secret only to the single step that posts to Slack.
- Never pass the Slack secret to watchdog workflows.
