import test from "node:test";
import assert from "node:assert/strict";
import { createClarityTextChart } from "../src/clarity-chart.mjs";
import {
  calculateChange,
  createClaritySlackPayload,
} from "../src/clarity-slack.mjs";
import {
  fetchClarityMarket,
  parseClarityEvent,
  parsePriceHistory,
} from "../src/polymarket.mjs";

const EVENT = {
  id: "158505",
  title: "Clarity Act signed into law in 2026?",
  active: true,
  closed: false,
  endDate: "2027-01-01T05:00:00Z",
  markets: [{
    id: "1163699",
    question: "Clarity Act (H.R.3633) signed into law in 2026?",
    active: true,
    closed: false,
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.295\", \"0.705\"]",
    clobTokenIds: "[\"123456789\", \"987654321\"]",
    volume: "2926230.91",
    liquidity: "50810.53",
  }],
};

test("Polymarket event parser selects the YES outcome and token", () => {
  const market = parseClarityEvent(EVENT);

  assert.equal(market.yesTokenId, "123456789");
  assert.equal(market.yesProbability, 0.295);
  assert.equal(market.title, "Clarity Act (H.R.3633) signed into law in 2026?");
  assert.equal(market.volume, 2926230.91);
});

test("Polymarket fetch uses Gamma metadata and CLOB token history", async () => {
  const urls = [];
  const fetchedAt = new Date("2026-07-29T12:00:00.000Z");
  const result = await fetchClarityMarket({
    fetchedAt,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => (
          String(url).includes("gamma-api")
            ? EVENT
            : { history: [{ t: 1_785_240_000, p: 0.37 }] }
        ),
      };
    },
  });

  assert.match(urls[0], /gamma-api\.polymarket\.com/);
  assert.match(urls[1], /market=123456789/);
  assert.match(urls[1], /interval=max/);
  assert.equal(result.history.at(-1).probability, 0.295);
  assert.equal(result.history.at(-1).timestamp, 1_785_326_400);
});

test("price history is normalized, sorted, and ends at current probability", () => {
  const fetchedAt = new Date("2026-07-29T12:00:00.000Z");
  const history = parsePriceHistory({
    history: [
      { t: 1_785_240_000, p: 0.37 },
      { t: 1_785_153_600, p: 0.42 },
      { t: "invalid", p: 2 },
    ],
  }, fetchedAt, 0.295);

  assert.deepEqual(history.map(({ probability }) => probability), [
    0.42,
    0.37,
    0.295,
  ]);
});

test("Slack payload renders a JSON-only text chart without external images", () => {
  const snapshot = {
    ...parseClarityEvent(EVENT),
    sourceUrl: "https://polymarket.com/ja/event/test",
    history: [
      { timestamp: 1_785_153_600, probability: 0.42 },
      { timestamp: 1_785_240_000, probability: 0.37 },
      { timestamp: 1_785_326_400, probability: 0.295 },
    ],
  };
  const textChart = createClarityTextChart(snapshot, {
    width: 12,
    height: 4,
  });
  const payload = createClaritySlackPayload(snapshot, textChart);

  assert.match(textChart, /^100% ┤/u);
  assert.match(textChart, /  0% └─{12}/u);
  assert.match(textChart, /[▁▂▃▄▅▆▇█]/u);
  assert.match(textChart, /7\/27\s+7\/29/u);
  assert.match(payload.text, /YES 29\.5%/);
  assert.equal(payload.blocks[0].type, "header");
  assert.match(payload.blocks[2].fields[0].text, /29\.5%/);
  assert.match(payload.blocks[2].fields[1].text, /▼ 7\.5 pt/);
  assert.match(payload.blocks[4].text.text, /YES probability history/);
  assert.doesNotMatch(JSON.stringify(payload), /image_url|quickchart/i);
  assert.ok(Math.abs(calculateChange(snapshot.history, 86_400) + 0.075) < 1e-12);
});
