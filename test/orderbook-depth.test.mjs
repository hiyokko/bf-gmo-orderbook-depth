import test from "node:test";
import assert from "node:assert/strict";
import {
  consume,
  createSlackText,
  validateWebhookUrl,
} from "../src/orderbook-depth.mjs";

function result(target) {
  return {
    target,
    best: 10_000_000,
    limit: 10_000_000 + target * 100,
    vwap: 10_000_000 + target * 50,
    impactBps: target,
    impactPercent: target / 100,
    notional: target * 10_000_000,
    levelsUsed: 1,
    insufficient: false,
  };
}

function snapshot(name, symbol) {
  const ascending = [0.1, 0.3, 0.5, 1, 3].map(result);
  return {
    name,
    symbol,
    sourceTime: null,
    buy: ascending,
    sell: ascending,
  };
}

test("consume calculates VWAP, bp, and percent consistently", () => {
  const depth = consume([
    { price: 100, size: 0.1 },
    { price: 101, size: 0.2 },
  ], 0.3, "BUY");

  assert.equal(depth.insufficient, false);
  assert.equal(depth.limit, 101);
  assert.ok(Math.abs(depth.vwap - (100 * 0.1 + 101 * 0.2) / 0.3) < 1e-12);
  assert.ok(Math.abs(depth.impactPercent - depth.impactBps / 100) < 1e-12);
});

test("Slack text uses order-book display order and one blank line between exchanges", () => {
  const text = createSlackText([
    snapshot("bitFlyer Crypto CFD", "FX_BTC_JPY"),
    snapshot("GMOコイン レバレッジ", "BTC_JPY"),
  ], "2026/07/23 12:00:00");

  const bitFlyerStart = text.indexOf("*bitFlyer Crypto CFD*");
  const gmoStart = text.indexOf("*GMOコイン レバレッジ*");
  const bitFlyer = text.slice(bitFlyerStart, gmoStart);

  const askRows = [3, 1, 0.5, 0.3, 0.1].map((target) =>
    bitFlyer.indexOf(`\n${String(target).padStart(3)} |`));
  const bidStart = bitFlyer.indexOf("BID / SELL");
  const bidRows = [0.1, 0.3, 0.5, 1, 3].map((target) =>
    bitFlyer.indexOf(`\n${String(target).padStart(3)} |`, bidStart));

  assert.ok(askRows.every((index) => index >= 0));
  assert.ok(bidRows.every((index) => index >= 0));
  assert.deepEqual([...askRows].sort((a, b) => a - b), askRows);
  assert.deepEqual([...bidRows].sort((a, b) => a - b), bidRows);
  assert.match(text, /```\n\n\*GMOコイン レバレッジ\*/);
  assert.match(text, /\d+\.\d{2}bp \/ \d+\.\d{4}%/);
});

test("Webhook validation accepts only Slack Incoming Webhook URLs", () => {
  assert.equal(
    validateWebhookUrl("https://hooks.slack.com/services/T111/B222/secret"),
    true,
  );
  assert.equal(validateWebhookUrl("https://example.com/services/T111/B222/secret"), false);
  assert.equal(validateWebhookUrl("not-a-url"), false);
});
