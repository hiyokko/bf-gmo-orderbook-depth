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
- Display spot dealer-spread columns in this order: SBI VC, bb, bF, CC, GMO,
  OKJ. Do not display BPJ or CT columns. Display leverage columns in this
  order: SBI VC, bF, GMO.
- Use the official two-way quote for SBI VC and best bid/ask for the bitFlyer
  and GMO leverage orderbooks.
- Fetch GMO spot dealer quotes from the official website's unauthenticated
  `api/v1/master/getCurrentRate.json` feed and map its current dealer product
  IDs. Never use the exchange Public API's plain symbols for the GMO spot
  dealer column.
- Fetch GMO leverage best bid/ask from its documented Public API ticker,
  using only `_JPY` symbols for leverage.
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
- Keep the two primary report workflows separate. Use one unified watchdog
  workflow that evaluates and dispatches each report independently so a failure
  for one report does not prevent recovery of the other.
- Before a scheduled or watchdog-triggered spread post, wait for the matching
  orderbook-depth slot to complete successfully so Slack order is always depth,
  then spread. Manual spread tests remain independent.
- Monitor the Polymarket CLARITY Act report with the same unified watchdog.
  Before a scheduled or watchdog-triggered CLARITY post, wait for the matching
  spread report so Slack order is depth, spread, then CLARITY.
- Resolve the CLARITY market and YES token from Polymarket's official Gamma API,
  and fetch its price history from the official CLOB API. Render the history as
  all-history, trailing-30-day, and trailing-7-day QuickChart images using
  non-expiring URLs under Slack's 3,000-character limit. Do not use a short URL
  or API key. Fall back per period to the JSON-only Slack Unicode area chart
  with a vertical probability axis when QuickChart fails.
- Fetch all-history at daily fidelity, trailing-30-day history at six-hour
  fidelity, and trailing-7-day history at hourly fidelity. Render up to 60
  points for each period using straight line segments with no curve smoothing.
  If a shorter-period history request fails, fall back to slicing the
  all-history series instead of failing the report.
- Outside the CLARITY charts, show all-history, trailing-30-day,
  trailing-7-day, and 24-hour relative change rates with probability-point
  changes alongside them.
- Fetch CLARITY legislative status from the official GovInfo Bill Status XML.
  Display only explicitly allow-listed action patterns using deterministic
  wording. Never generate or infer a weekly political narrative; omit the
  status block when fetching or classification fails.
- Keep calculation, external I/O, orchestration, and CLI entry points in separate modules under `src/` and `scripts/`.
- Normalize and sort each exchange side once before calculating all configured target quantities.
- Run `npm test`, `npm run dry-run`, `npm run spread:dry-run`, and
  `npm run clarity:dry-run` after code or workflow changes.

## Public-repository security

- Store the Slack Incoming Webhook URL only in the GitHub Actions repository secret named `SLACK_WEBHOOK_URL`.
- For local execution, `.env` may contain `SLACK_WEBHOOK_URL`, but it must remain Git-ignored with owner-only permissions.
- Never print, commit, upload, document, or place the Webhook URL in workflow inputs.
- Never trigger a secret-bearing workflow from pull requests or untrusted code.
- Give `GITHUB_TOKEN` read-only contents permission.
- Limit `actions: write` to the unified watchdog workflow that dispatches the primary workflows.
- Pin every referenced GitHub Action to a full-length commit SHA.
- Pass the Slack secret only to the single step that posts to Slack.
- Never pass the Slack secret to watchdog workflows.
