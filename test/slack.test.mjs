import test from "node:test";
import assert from "node:assert/strict";
import {
  createSlackText,
  postToSlack,
  validateWebhookUrl,
} from "../src/slack.mjs";

function result(target) {
  return {
    target,
    best: 10_000_000,
    limit: 10_000_000 + target * 100,
    vwap: 10_000_000 + target * 50,
    limitImpactBps: target * 2,
    limitImpactPercent: target * 2 / 100,
    vwapImpactBps: target,
    vwapImpactPercent: target / 100,
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

test("Slack text uses the requested display order and one blank line between exchanges", () => {
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

  assert.deepEqual([...askRows].sort((left, right) => left - right), askRows);
  assert.deepEqual([...bidRows].sort((left, right) => left - right), bidRows);
  assert.match(text, /```\n\n\*GMOコイン レバレッジ\*/);
  assert.match(
    text,
    /到達価格 \| +到達影響\(bp \/ %\) \| +VWAP \| +VWAP影響\(bp \/ %\)/,
  );
  assert.doesNotMatch(text, /\(JPY\)|BUY（|SELL（/);
  assert.match(
    text,
    /\d+\.\d{2}bp \/ \d+\.\d{4}% \| +[\d,.]+ \| +\d+\.\d{2}bp \/ \d+\.\d{4}%/,
  );
});

test("Slack formatting rejects snapshots missing a configured target", () => {
  const incomplete = snapshot("Test", "BTC_JPY");
  incomplete.buy = incomplete.buy.slice(1);
  assert.throws(
    () => createSlackText([incomplete], "2026/07/23 12:00:00"),
    /0.1 BTC is missing/,
  );
});

test("Webhook validation accepts only Slack Incoming Webhook URLs", () => {
  assert.equal(
    validateWebhookUrl("https://hooks.slack.com/services/T111/B222/secret"),
    true,
  );
  assert.equal(validateWebhookUrl("https://example.com/services/T111/B222/secret"), false);
  assert.equal(validateWebhookUrl("not-a-url"), false);
});

test("Slack delivery validates the response body", async () => {
  const calls = [];
  const response = await postToSlack(
    "message",
    "https://hooks.slack.com/services/T111/B222/secret",
    {
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          status: 200,
          text: async () => "ok",
        };
      },
    },
  );

  assert.equal(response, "ok");
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), { text: "message" });
});
