import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBitbankRates,
  parseBitpointRates,
  parseCoincheckRates,
  parseCointradeRates,
  parseGmoRates,
  parseOkjRates,
  parseSbivcListings,
  parseSbivcRates,
} from "../src/spread-sources.mjs";

test("SBIVC listings use the first dealer tables and preserve their current order", () => {
  const filler = (prefix, count) => Array.from(
    { length: count },
    (_, index) => `<tr class="data_row"><td><b>${prefix}${index}</b></td></tr>`,
  ).join("");
  const html = `
    <h4>現物（販売所）</h4>
    <table>${filler("S", 10)}<tr class="data_row"><td><b>POL</b></td></tr></table>
    <h4>レバレッジ（販売所）</h4>
    <table>${filler("L", 3)}<tr class="data_row"><td><b>DAI</b></td></tr></table>
    <h4>レバレッジ（販売所）</h4>
    <table><tr class="data_row"><td><b>OLD</b></td></tr></table>
  `;

  const listings = parseSbivcListings(html);
  assert.deepEqual(listings.spot.slice(-1), ["POL"]);
  assert.deepEqual(listings.leverage.slice(-1), ["DAI"]);
  assert.doesNotMatch(listings.leverage.join(","), /OLD/);
});

test("SBIVC nested dealer feed separates spot and leverage quotes", () => {
  const parsed = parseSbivcRates({
    body: {
      rate: [
        ["EX_BTC/JPY", "time", ["10,000", "", "", "", true], ["10,200", "", "", "", true]],
        ["CFD_BTC/JPY", "time", ["10,050", "", "", "", true], ["10,150", "", "", "", true]],
        ["EX_OLD/JPY", "time", ["1", "", "", "", false], ["2", "", "", "", true]],
      ],
    },
  });

  assert.deepEqual(parsed.spot.sbivc.BTC, { bid: 10_000, ask: 10_200 });
  assert.deepEqual(parsed.leverage.sbivc.BTC, { bid: 10_050, ask: 10_150 });
  assert.equal(parsed.spot.sbivc.OLD, undefined);
});

test("source parsers normalize known venue symbol aliases", () => {
  assert.deepEqual(
    parseCoincheckRates({
      marketplace_rates: [{
        pair: "matic_jpy",
        sell_rate: "10",
        buy_rate: "11",
      }],
    }).POL,
    { bid: 10, ask: 11 },
  );
  assert.deepEqual(
    parseBitpointRates({
      ticker: [{
        symbol: "LNKJPY",
        bidPrice: "100",
        askPrice: "102",
      }],
    }).LINK,
    { bid: 100, ask: 102 },
  );
  assert.deepEqual(
    parseBitbankRates({
      data: { prices: [{ asset: "bcc", bid: "200", ask: "205" }] },
    }).BCH,
    { bid: 200, ask: 205 },
  );
  assert.deepEqual(
    parseOkjRates({
      data: [{
        baseCurrencySymbol: "CC",
        sellPrice: "50",
        buyPrice: "55",
        isOnline: true,
      }],
    }).CANTON,
    { bid: 50, ask: 55 },
  );
});

test("GMO and CoinTrade parsers separate products and ignore inactive rows", () => {
  const gmo = parseGmoRates({
    data: [
      { productId: 1001, bid: "100", ask: "102" },
      { productId: 10001, bid: "101", ask: "103" },
    ],
  });
  assert.deepEqual(gmo.spot.gmo.BTC, { bid: 100, ask: 102 });
  assert.deepEqual(gmo.leverage.gmo.BTC, { bid: 101, ask: 103 });

  const cointrade = parseCointradeRates({
    body: {
      rate: [
        ["EX_ETH/JPY", "", ["200", "", "", "", true], ["205", "", "", "", true]],
        ["EX_XRP/JPY", "", ["10", "", "", "", false], ["11", "", "", "", true]],
      ],
    },
  });
  assert.deepEqual(cointrade.ETH, { bid: 200, ask: 205 });
  assert.equal(cointrade.XRP, undefined);
});
