import test from "node:test";
import assert from "node:assert/strict";
import {
  createBpjVctComparison,
  workbookSessionLabel,
} from "../src/bpj-vct-comparison.mjs";
import { createBpjVctSlackText } from "../src/bpj-vct-slack.mjs";
import {
  parseBitpointDealerRates,
  parseSbivcDealerRates,
} from "../src/bpj-vct-sources.mjs";

test("BITPOINT dealer parser maps LNKJPY to LINK", () => {
  const parsed = parseBitpointDealerRates({
    createdAt: "2026-08-16T00:00:00.000Z",
    ticker: [
      { symbol: "BTCJPY", bidPrice: "10,000", askPrice: "10,200" },
      { symbol: "LNKJPY", bidPrice: "1,500", askPrice: "1,600" },
    ],
  });
  assert.deepEqual(parsed.quotes, {
    BTC: { bid: 10_000, ask: 10_200 },
    LINK: { bid: 1_500, ask: 1_600 },
  });
  assert.equal(parsed.updatedAt, "2026-08-16T00:00:00.000Z");
});

test("SBI VC parser keeps only enabled dealer quotes", () => {
  const parsed = parseSbivcDealerRates({
    meta: { timestamp: 1_787_020_800_000 },
    body: {
      rate: [
        ["EX_BTC/JPY", 1_787_020_800_000, ["10,100", "", "", "", true], ["10,300", "", "", "", true]],
        ["CFD_BTC/JPY", 1_787_020_800_000, ["10,150"], ["10,250"]],
        ["EX_OLD/JPY", 1_787_020_800_000, ["1", "", "", "", false], ["2", "", "", "", true]],
      ],
    },
  });
  assert.deepEqual(parsed.quotes, { BTC: { bid: 10_100, ask: 10_300 } });
  assert.equal(parsed.updatedAt, new Date(1_787_020_800_000).toISOString());
});

test("comparison reproduces workbook sell and buy formulas", () => {
  const rows = createBpjVctComparison({
    bpj: { quotes: { BTC: { bid: 100, ask: 110 } } },
    vct: { quotes: { BTC: { bid: 101, ask: 108 } } },
  });
  assert.deepEqual(rows[0], {
    symbol: "BTCJPY",
    status: "ok",
    sellPercent: 1,
    buyPercent: (-2 / 110) * 100,
  });
  assert.equal(rows[1].status, "unavailable");
});

test("Slack output preserves workbook precision, order, and aligned pipes", () => {
  const rows = createBpjVctComparison({
    bpj: { quotes: { BTC: { bid: 100, ask: 110 }, ETH: { bid: 200, ask: 220 } } },
    vct: { quotes: { BTC: { bid: 101, ask: 108 }, ETH: { bid: 198, ask: 220 } } },
  });
  const text = createBpjVctSlackText(rows, new Date("2026-08-16T00:00:00.000Z"));
  assert.match(text, /20260816TYO/);
  assert.match(text, /BTCJPY \|  1\.000% \| -1\.818%/);
  assert.match(text, /ETHJPY \| -1\.000% \|  0\.000%/);
  assert.ok(text.indexOf("BTCJPY") < text.indexOf("ETHJPY"));
  const tableLines = text.split("\n").filter((line) => line.includes(" | "));
  const pipeIndexes = tableLines.map((line) => [line.indexOf("|"), line.lastIndexOf("|")]);
  assert.ok(pipeIndexes.every(([first, last]) => first === pipeIndexes[0][0] && last === pipeIndexes[0][1]));
});

test("workbook session label follows the NY, TYO, and LDN boundaries", () => {
  assert.equal(workbookSessionLabel(new Date("2026-08-15T16:00:00.000Z")), "20260815NY");
  assert.equal(workbookSessionLabel(new Date("2026-08-15T23:00:00.000Z")), "20260816TYO");
  assert.equal(workbookSessionLabel(new Date("2026-08-16T08:00:00.000Z")), "20260816LDN");
});
