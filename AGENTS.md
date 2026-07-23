# AGENTS.md

## Scope

These instructions apply to the repository root and all descendants.

## Project rules

- Keep the repository safe for public visibility.
- Use `FX_BTC_JPY` for bitFlyer Crypto CFD and `BTC_JPY` for GMO Coin leveraged BTC.
- Calculate BUY depth by consuming asks in ascending price order.
- Calculate SELL depth by consuming bids in descending price order.
- Keep target quantities at 0.1, 0.3, 0.5, 1, and 3 BTC unless the user requests a change.
- Display ask/BUY rows as 3, 1, 0.5, 0.3, 0.1 BTC toward best, followed by bid/SELL rows as 0.1, 0.3, 0.5, 1, 3 BTC away from best.
- Calculate impact from `mid = (bestAsk + bestBid) / 2`.
- Display arrival-price impact as a percentage.
- Use `price impact = midから価格までの距離` as the Slack methodology caption.
- Label the arrival-price impact column `price impact`.
- Display the mid price on its own line between horizontal separator lines.
- Place the table header directly below ASK/BUY, and place the repeated table
  header and BID/SELL label below the SELL rows so the layout mirrors around MID.
- Display an exchange API response timestamp on the line below its name and symbol.
- Align Slack table columns by rendered display width, treating Japanese characters as double-width.
- Separate the bitFlyer and GMO Coin Slack blocks with one blank line.
- Keep the GitHub Actions schedule at JST 01:00, 09:00, and 17:00 daily, representing the requested 09:00, 17:00, and 25:00 cycle.
- Keep the watchdog recovery window at 20–360 minutes after the latest scheduled slot, and do not treat ordinary manual runs as slot completion.
- Keep calculation, external I/O, orchestration, and CLI entry points in separate modules under `src/` and `scripts/`.
- Normalize and sort each exchange side once before calculating all configured target quantities.
- Run `npm test` and `npm run dry-run` after code or workflow changes.

## Public-repository security

- Store the Slack Incoming Webhook URL only in the GitHub Actions repository secret named `SLACK_WEBHOOK_URL`.
- For local execution, `.env` may contain `SLACK_WEBHOOK_URL`, but it must remain Git-ignored with owner-only permissions.
- Never print, commit, upload, document, or place the Webhook URL in workflow inputs.
- Never trigger a secret-bearing workflow from pull requests or untrusted code.
- Give `GITHUB_TOKEN` read-only contents permission.
- Limit `actions: write` to the watchdog workflow that dispatches the primary workflow.
- Pin every referenced GitHub Action to a full-length commit SHA.
- Pass the Slack secret only to the single step that posts to Slack.
- Never pass the Slack secret to the watchdog workflow.
