import test from "node:test";
import assert from "node:assert/strict";
import { createClarityTextChart } from "../src/clarity-chart.mjs";
import { calculateChangeMetrics } from "../src/clarity-metrics.mjs";
import { createClarityPeriodSnapshots } from "../src/clarity-periods.mjs";
import {
  createClarityQuickChartUrl,
  verifyQuickChartImage,
} from "../src/clarity-quickchart.mjs";
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
  const historyQueries = urls.slice(1).map((value) => {
    const url = new URL(value);
    return {
      interval: url.searchParams.get("interval"),
      fidelity: url.searchParams.get("fidelity"),
    };
  });
  assert.deepEqual(historyQueries, [
    { interval: "max", fidelity: "1440" },
    { interval: "1m", fidelity: "360" },
    { interval: "1w", fidelity: "60" },
  ]);
  assert.ok(urls.slice(1).every((url) => /market=123456789/.test(url)));
  assert.equal(result.history.at(-1).probability, 0.295);
  assert.equal(result.history.at(-1).timestamp, 1_785_326_400);
  assert.equal(result.periodHistories.month.length, 2);
  assert.equal(result.periodHistories.week.length, 2);
  assert.deepEqual(result.periodHistoryErrors, {});
});

test("Polymarket fetch keeps all history when a detailed period fails", async () => {
  const fetchedAt = new Date("2026-07-29T12:00:00.000Z");
  const result = await fetchClarityMarket({
    fetchedAt,
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes("gamma-api")) {
        return {
          ok: true,
          status: 200,
          json: async () => EVENT,
        };
      }
      const interval = new URL(value).searchParams.get("interval");
      if (interval === "1m") {
        return {
          ok: false,
          status: 503,
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          history: [{ t: 1_785_240_000, p: 0.37 }],
        }),
      };
    },
  });

  assert.equal(result.history.length, 2);
  assert.equal(result.periodHistories.month, undefined);
  assert.equal(result.periodHistories.week.length, 2);
  assert.match(result.periodHistoryErrors.month, /HTTP 503/);
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

test("QuickChart URL contains a compact vertical chart without credentials", () => {
  const snapshot = {
    ...parseClarityEvent(EVENT),
    sourceUrl: "https://polymarket.com/ja/event/test",
    history: [
      { timestamp: 1_785_153_600, probability: 0.42 },
      { timestamp: 1_785_240_000, probability: 0.37 },
      { timestamp: 1_785_326_400, probability: 0.295 },
    ],
  };
  const imageUrl = createClarityQuickChartUrl(snapshot);
  const parsedUrl = new URL(imageUrl);
  const chart = JSON.parse(parsedUrl.searchParams.get("c"));

  assert.equal(parsedUrl.origin, "https://quickchart.io");
  assert.ok(imageUrl.length < 2_000);
  assert.equal(parsedUrl.searchParams.get("devicePixelRatio"), "1");
  assert.equal(chart.type, "line");
  assert.equal(chart.options.scales.y.min, 0);
  assert.equal(chart.options.scales.y.max, 100);
  assert.deepEqual(chart.data.datasets[0].data, [42, 37, 29.5]);
  assert.equal(chart.data.datasets[0].tension, 0);
  assert.doesNotMatch(imageUrl, /key|token|secret/i);
});

test("QuickChart suppresses a duplicate current-day axis label", () => {
  const snapshot = {
    ...parseClarityEvent(EVENT),
    history: [
      { timestamp: 1_785_240_000, probability: 0.37 },
      { timestamp: 1_785_312_000, probability: 0.31 },
      { timestamp: 1_785_326_400, probability: 0.295 },
    ],
  };
  const chart = JSON.parse(
    new URL(createClarityQuickChartUrl(snapshot)).searchParams.get("c"),
  );

  assert.deepEqual(chart.data.labels, ["7/28", "", "7/29"]);
});

test("QuickChart renders up to 60 points for detailed shorter periods", () => {
  const history = Array.from({ length: 140 }, (_, index) => ({
    timestamp: 1_784_000_000 + index * 3_600,
    probability: 0.3 + index % 20 / 100,
  }));
  const imageUrl = createClarityQuickChartUrl({
    ...parseClarityEvent(EVENT),
    history,
  }, {
    maxPoints: 60,
    periodLabel: "Last 1 week",
  });
  const chart = JSON.parse(new URL(imageUrl).searchParams.get("c"));

  assert.equal(chart.data.datasets[0].data.length, 60);
  assert.ok(imageUrl.length < 2_000);
});

test("CLARITY periods select all history, trailing month, and trailing week", () => {
  const day = 86_400;
  const latest = 5_000_000;
  const periods = createClarityPeriodSnapshots({
    history: [
      { timestamp: latest - 40 * day, probability: 0.8 },
      { timestamp: latest - 30 * day, probability: 0.6 },
      { timestamp: latest - 8 * day, probability: 0.5 },
      { timestamp: latest - 7 * day, probability: 0.4 },
      { timestamp: latest, probability: 0.3 },
    ],
  });

  assert.deepEqual(periods.map(({ id }) => id), ["all", "month", "week"]);
  assert.deepEqual(
    periods.map(({ snapshot }) => snapshot.history.length),
    [5, 4, 2],
  );
  assert.deepEqual(periods.map(({ chartPoints }) => chartPoints), [60, 60, 60]);
});

test("CLARITY periods prefer separately fetched detailed histories", () => {
  const history = [
    { timestamp: 1, probability: 0.5 },
    { timestamp: 2, probability: 0.4 },
  ];
  const periods = createClarityPeriodSnapshots({
    history,
    periodHistories: {
      month: [...history, { timestamp: 3, probability: 0.3 }],
      week: [...history, { timestamp: 3, probability: 0.3 }, {
        timestamp: 4,
        probability: 0.2,
      }],
    },
  });

  assert.deepEqual(
    periods.map(({ snapshot }) => snapshot.history.length),
    [2, 3, 4],
  );
});

test("Slack payload uses the QuickChart image and keeps text fallback", () => {
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
  const imageUrl = createClarityQuickChartUrl(snapshot);
  const changeMetrics = calculateChangeMetrics(snapshot.history);
  const charts = [
    { label: "All history", textChart, imageUrl, changeMetrics },
    { label: "Last 1 month", textChart, imageUrl, changeMetrics },
    { label: "Last 1 week", textChart, imageUrl, changeMetrics },
  ];
  const payload = createClaritySlackPayload(snapshot, charts);
  const fallback = createClaritySlackPayload(
    snapshot,
    charts.map((chart) => ({ ...chart, imageUrl: null })),
  );

  assert.match(textChart, /^100% ┤/u);
  assert.match(textChart, /  0% └─{12}/u);
  assert.match(textChart, /[▁▂▃▄▅▆▇█]/u);
  assert.match(textChart, /7\/27\s+7\/29/u);
  assert.match(payload.text, /YES 29\.5%/);
  assert.equal(payload.blocks[0].type, "header");
  assert.match(payload.blocks[2].fields[0].text, /29\.5%/);
  assert.match(
    payload.blocks[2].fields[1].text,
    /▼ 20\.3% \(-7\.5 pt\)/,
  );
  assert.match(
    payload.blocks[3].fields[0].text,
    /▼ 29\.8% \(-12\.5 pt\)/,
  );
  assert.deepEqual(
    payload.blocks.slice(5, 8).map(({ type }) => type),
    ["image", "image", "image"],
  );
  assert.equal(payload.blocks[5].image_url, imageUrl);
  assert.match(fallback.blocks[5].text.text, /\*All history\*/);
  assert.ok(Math.abs(calculateChange(snapshot.history, 86_400) + 0.075) < 1e-12);
});

test("QuickChart verifier accepts only a successful PNG response", async () => {
  const result = await verifyQuickChartImage(
    "https://quickchart.io/chart?chart=test",
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/png" }),
        body: null,
      }),
    },
  );

  assert.equal(result.status, 200);
  await assert.rejects(
    verifyQuickChartImage("https://quickchart.io/chart?chart=test", {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/plain" }),
        body: null,
      }),
    }),
    /unexpected content type/,
  );
});
