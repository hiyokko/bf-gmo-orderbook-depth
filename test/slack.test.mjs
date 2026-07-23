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
    limitImpactPercent: target * 2 / 100,
    levelsUsed: 1,
    insufficient: false,
  };
}

function snapshot(name, symbol, sourceTime = null) {
  const ascending = [0.1, 0.3, 0.5, 1, 3].map(result);
  return {
    name,
    symbol,
    sourceTime,
    bestAsk: 10_001_000,
    bestBid: 9_999_000,
    mid: 10_000_000,
    buy: ascending,
    sell: ascending,
  };
}

test("Slack text uses the requested display order and one blank line between exchanges", () => {
  const text = createSlackText([
    snapshot("bitFlyer Crypto CFD", "FX_BTC_JPY"),
    snapshot(
      "GMOコイン レバレッジ",
      "BTC_JPY",
      "2026-07-23T11:52:11.975Z",
    ),
  ], "2026/07/23 12:00:00");

  const bitFlyerStart = text.indexOf("*bitFlyer Crypto CFD*");
  const gmoStart = text.indexOf("*GMOコイン レバレッジ*");
  const bitFlyer = text.slice(bitFlyerStart, gmoStart);
  const askRows = [3, 1, 0.5, 0.3, 0.1].map((target) =>
    bitFlyer.indexOf(`\n${String(target).padStart(6)} |`));
  const midStart = bitFlyer.indexOf("MID ");
  const bidRows = [0.1, 0.3, 0.5, 1, 3].map((target) =>
    bitFlyer.indexOf(`\n${String(target).padStart(6)} |`, midStart));
  const bestAskStart = bitFlyer.indexOf("\n  best |");
  const bestBidStart = bitFlyer.indexOf("\n  best |", midStart);
  const bidHeaderStart = bitFlyer.indexOf("amount", midStart);
  const bidLabelStart = bitFlyer.indexOf("BID / SELL", midStart);

  assert.deepEqual([...askRows].sort((left, right) => left - right), askRows);
  assert.deepEqual([...bidRows].sort((left, right) => left - right), bidRows);
  assert.ok(askRows.at(-1) < bestAskStart);
  assert.ok(bestAskStart < midStart);
  assert.ok(midStart < bestBidStart);
  assert.ok(bestBidStart < bidRows[0]);
  assert.ok(bidRows.at(-1) < bidHeaderStart);
  assert.ok(bidHeaderStart < bidLabelStart);
  assert.match(text, /```\n\n\*GMOコイン レバレッジ\*/);
  assert.match(
    text,
    /\*GMOコイン レバレッジ\* `BTC_JPY`\nAPI応答時刻 2026-07-23T11:52:11\.975Z\n```/,
  );
  assert.match(text, /impact = midからpriceまでの距離/);
  assert.doesNotMatch(text, /手数料・スプレッド外コストは除外/);
  assert.match(
    text,
    /\n────────────────\nMID 10,000,000\.0（SP 2,000／0\.0200%）\n────────────────\n/,
  );
  assert.match(
    bitFlyer,
    /ASK \/ BUY\namount \| {8}price \| {4}impact/,
  );
  assert.match(
    bitFlyer,
    /amount \| {8}price \| {4}impact\nBID \/ SELL/,
  );
  assert.equal(
    [...text.matchAll(/amount \| {8}price \| {4}impact/g)].length,
    4,
  );
  assert.doesNotMatch(text, /数量|価格/);
  assert.doesNotMatch(text, /price impact/);
  const tableLines = bitFlyer
    .split("\n")
    .filter((line) => line.includes("|"));
  assert.deepEqual(
    [...new Set(tableLines.map(slackPipePositions))],
    ["7,22"],
  );
  assert.match(text, /\n     3 \|   10,000,300 \| {3}0\.0600%\n/);
  assert.match(text, /\n   0\.1 \|   10,000,010 \| {3}0\.0020%\n/);
  assert.match(
    bitFlyer,
    /\n  best \|   10,001,000 \| {3}0\.0100%\n────────────────\nMID/,
  );
  assert.match(
    bitFlyer,
    /MID 10,000,000\.0（SP 2,000／0\.0200%）\n────────────────\n  best \|    9,999,000 \| {3}0\.0100%\n/,
  );
  assert.equal([...text.matchAll(/\n  best \|/g)].length, 4);
  assert.doesNotMatch(text, /\(JPY\)|BUY（|SELL（|\bbp\b|VWAP/);
  assert.match(text, /[\d,.]+ \| +\d+\.\d{4}%/);
});

function slackPipePositions(line) {
  let prefix = "";
  const positions = [];
  for (const character of line) {
    if (character === "|") {
      positions.push(slackDisplayWidth(prefix));
    }
    prefix += character;
  }
  return positions.join(",");
}

function slackDisplayWidth(value) {
  return [...String(value)].reduce((width, character) => (
    width + (
      /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/u
        .test(character)
        ? 1.5
        : 1
    )
  ), 0);
}

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
