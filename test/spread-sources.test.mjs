import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchBitflyerSpot,
  parseBitbankRates,
  parseBitflyerSpotRate,
  parseCoincheckRates,
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

test("bitFlyer dealer rate parser accepts enabled JPY quotes", () => {
  assert.deepEqual(
    parseBitflyerSpotRate({
      data: {
        product_code: "ETH_JPY",
        bid: 312_532,
        ask: 335_228,
        enable_bid: true,
        enable_ask: true,
      },
      status: 0,
    }).ETH,
    { bid: 312_532, ask: 335_228 },
  );
  assert.deepEqual(
    parseBitflyerSpotRate({
      data: {
        product_code: "CANTON_JPY",
        bid: -1,
        ask: -1,
        enable_bid: false,
        enable_ask: false,
      },
      status: 0,
    }),
    {},
  );
});

test("bitFlyer spot fetch gets each SBIVC symbol and skips unsupported quotes", async () => {
  const requestedUrls = [];
  const quotes = await fetchBitflyerSpot(["BTC", "ETH", "CANTON"], {
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      const productCode = new URL(url).searchParams.get("product_code");
      const supported = productCode !== "CANTON_JPY";
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            product_code: productCode,
            bid: supported ? (productCode === "BTC_JPY" ? 100 : 200) : -1,
            ask: supported ? (productCode === "BTC_JPY" ? 102 : 204) : -1,
            enable_bid: supported,
            enable_ask: supported,
          },
          status: 0,
        }),
      };
    },
  });

  assert.deepEqual(quotes, {
    BTC: { bid: 100, ask: 102 },
    ETH: { bid: 200, ask: 204 },
  });
  assert.deepEqual(
    requestedUrls.map((url) => new URL(url).searchParams.get("product_code")),
    ["BTC_JPY", "ETH_JPY", "CANTON_JPY"],
  );
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

test("GMO parser separates spot and leverage products", () => {
  const gmo = parseGmoRates({
    status: 0,
    data: [
      { symbol: "BTC", bid: "100", ask: "102" },
      { symbol: "BTC_JPY", bid: "101", ask: "103" },
      { symbol: "SUI_JPY", bid: "200", ask: "205" },
    ],
  });
  assert.deepEqual(gmo.spot.gmo.BTC, { bid: 100, ask: 102 });
  assert.deepEqual(gmo.leverage.gmo.BTC, { bid: 101, ask: 103 });
  assert.deepEqual(gmo.leverage.gmo.SUI, { bid: 200, ask: 205 });
});
