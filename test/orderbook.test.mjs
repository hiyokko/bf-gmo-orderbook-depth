import test from "node:test";
import assert from "node:assert/strict";
import { DEPTH_TARGETS } from "../src/config.mjs";
import {
  EXCHANGES,
  calculateDepth,
  calculateDepths,
  fetchExchangeSnapshot,
  parseBitFlyerOrderBook,
  parseGmoOrderBook,
} from "../src/orderbook.mjs";

test("configuration keeps the required exchanges, symbols, and target quantities", () => {
  assert.deepEqual(DEPTH_TARGETS, [0.1, 0.3, 0.5, 1, 3]);
  assert.deepEqual(
    EXCHANGES.map(({ id, symbol }) => ({ id, symbol })),
    [
      { id: "bitflyer", symbol: "FX_BTC_JPY" },
      { id: "gmo", symbol: "BTC_JPY" },
    ],
  );
});

test("BUY depth calculates arrival-price and VWAP impacts consistently", () => {
  const depth = calculateDepth([
    { price: 101, size: 0.2 },
    { price: 100, size: 0.1 },
  ], 0.3, "BUY", 99.5);

  assert.equal(depth.insufficient, false);
  assert.equal(depth.best, 100);
  assert.equal(depth.referencePrice, 99.5);
  assert.equal(depth.limit, 101);
  assert.ok(Math.abs(depth.vwap - (100 * 0.1 + 101 * 0.2) / 0.3) < 1e-12);
  assert.ok(
    Math.abs(depth.limitImpactPercent - ((101 / 99.5) - 1) * 100) < 1e-12,
  );
  assert.ok(depth.vwapImpactPercent > 0);
  assert.ok(depth.vwapImpactPercent < depth.limitImpactPercent);
});

test("SELL depth sorts bids descending and reports both unfavorable impacts", () => {
  const depth = calculateDepth([
    { price: 99, size: 0.2 },
    { price: 100, size: 0.1 },
  ], 0.3, "SELL", 100.5);

  assert.equal(depth.best, 100);
  assert.equal(depth.referencePrice, 100.5);
  assert.equal(depth.limit, 99);
  assert.ok(
    Math.abs(depth.limitImpactPercent - (1 - (99 / 100.5)) * 100) < 1e-12,
  );
  assert.ok(depth.vwapImpactPercent > 0);
  assert.ok(depth.vwapImpactPercent < depth.limitImpactPercent);
});

test("depth calculation filters invalid levels and reports insufficient liquidity", () => {
  const [small, large] = calculateDepths([
    { price: "100", size: "0.1" },
    { price: 0, size: 5 },
    { price: 101, size: -1 },
    { price: "invalid", size: 3 },
  ], [0.1, 0.3], "BUY", 99.5);

  assert.equal(small.insufficient, false);
  assert.equal(large.insufficient, true);
  assert.ok(Math.abs(large.available - 0.1) < 1e-12);
  assert.throws(
    () => calculateDepth([{ price: 100, size: 1 }], 0.1, "BUY"),
    /Invalid impact reference price/,
  );
});

test("exchange response parsers normalize bitFlyer and GMO payloads", () => {
  const bitFlyer = parseBitFlyerOrderBook({
    asks: [{ price: 101, size: 1 }],
    bids: [{ price: 100, size: 1 }],
  });
  const gmo = parseGmoOrderBook({
    status: 0,
    responsetime: "2026-07-23T00:00:00Z",
    data: {
      asks: [{ price: "101", size: "1" }],
      bids: [{ price: "100", size: "1" }],
    },
  });

  assert.equal(bitFlyer.sourceTime, null);
  assert.equal(gmo.sourceTime, "2026-07-23T00:00:00Z");
  assert.throws(() => parseGmoOrderBook({ status: 5 }), /GMO API status 5/);
});

test("fetchExchangeSnapshot keeps exchange metadata and calculates both sides", async () => {
  const exchange = {
    name: "Test Exchange",
    symbol: "BTC_JPY",
    url: "https://example.test/orderbook",
    parse: (body) => body,
  };
  const snapshot = await fetchExchangeSnapshot(exchange, {
    targets: [0.1],
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        asks: [{ price: 101, size: 1 }],
        bids: [{ price: 100, size: 1 }],
        sourceTime: null,
      }),
    }),
  });

  assert.equal(snapshot.name, "Test Exchange");
  assert.equal(snapshot.bestAsk, 101);
  assert.equal(snapshot.bestBid, 100);
  assert.equal(snapshot.mid, 100.5);
  assert.equal(snapshot.buy[0].limit, 101);
  assert.equal(snapshot.sell[0].limit, 100);
  assert.ok(snapshot.buy[0].limitImpactPercent > 0);
  assert.ok(snapshot.sell[0].limitImpactPercent > 0);
});
