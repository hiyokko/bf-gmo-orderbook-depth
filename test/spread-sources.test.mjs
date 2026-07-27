import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchBitflyerSpot,
  fetchRakutenLeverage,
  fetchSbifxLeverage,
  parseBitbankRates,
  parseBitflyerSpotRate,
  parseCoincheckRates,
  parseFxtfRates,
  parseGmoRates,
  parseOkjRates,
  parseRakutenOrderbook,
  parseRakutenSymbols,
  parseSbivcListings,
  parseSbivcRates,
  parseSbifxRate,
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

test("SBI FX parser extracts the official website two-way CFD quote", () => {
  const body = [
    "RATE\t0\t20260727175801",
    "1",
    "BTCJPY\tBitcoin/JPY\t10647832\t10652832\t10647832\t10652832\t51428",
  ].join("\n");

  assert.deepEqual(parseSbifxRate(body, "BTC"), {
    BTC: { bid: 10_647_832, ask: 10_652_832 },
  });
  assert.deepEqual(parseSbifxRate(body, "SOL"), {});
});

test("SBI FX fetch requests only supported SBIVC leverage symbols", async () => {
  const requestedSymbols = [];
  const quotes = await fetchSbifxLeverage(["BTC", "SOL", "ETH"], {
    fetchImpl: async (_url, options) => {
      const symbol = new URLSearchParams(options.body).get("CURID").slice(0, -3);
      requestedSymbols.push(symbol);
      return {
        ok: true,
        status: 200,
        text: async () => [
          "RATE\t0\t20260727175801",
          "1",
          `${symbol}JPY\tname\t100\t102\t100\t102`,
        ].join("\n"),
      };
    },
  });

  assert.deepEqual(requestedSymbols, ["BTC", "ETH"]);
  assert.deepEqual(quotes, {
    BTC: { bid: 100, ask: 102 },
    ETH: { bid: 100, ask: 102 },
  });
});

test("Rakuten parsers accept only enabled personal JPY CFD products and best prices", () => {
  const products = parseRakutenSymbols([
    {
      id: 7,
      authority: "PERSONAL",
      baseCurrency: "BTC",
      quoteCurrency: "JPY",
      tradeType: "CFD",
      enabled: true,
      closeOnly: false,
      viewOnly: false,
    },
    {
      id: 8,
      authority: "PERSONAL",
      baseCurrency: "ETH",
      quoteCurrency: "JPY",
      tradeType: "CFD",
      enabled: true,
      closeOnly: true,
      viewOnly: false,
    },
    {
      id: 9,
      authority: "CORPORATE",
      baseCurrency: "BCH",
      quoteCurrency: "JPY",
      tradeType: "CFD",
      enabled: true,
      closeOnly: false,
      viewOnly: false,
    },
  ]);

  assert.deepEqual([...products], [["BTC", 7]]);
  assert.deepEqual(
    parseRakutenOrderbook({
      bestBid: "100",
      bestAsk: "102",
      bids: [{ price: "99" }],
      asks: [{ price: "103" }],
    }),
    { bid: 100, ask: 102 },
  );
  assert.deepEqual(
    parseRakutenOrderbook({
      bids: [{ price: "99" }, { price: "100" }],
      asks: [{ price: "103" }, { price: "102" }],
    }),
    { bid: 100, ask: 102 },
  );
});

test("Rakuten fetch follows the live product list and orderbook IDs", async () => {
  const requestedIds = [];
  const quotes = await fetchRakutenLeverage(["BTC", "ETH", "SOL"], {
    requestIntervalMs: 0,
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname.endsWith("/cfd/symbol")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 7,
              authority: "PERSONAL",
              baseCurrency: "BTC",
              quoteCurrency: "JPY",
              tradeType: "CFD",
              enabled: true,
              closeOnly: false,
              viewOnly: false,
            },
            {
              id: 8,
              authority: "PERSONAL",
              baseCurrency: "ETH",
              quoteCurrency: "JPY",
              tradeType: "CFD",
              enabled: true,
              closeOnly: false,
              viewOnly: false,
            },
          ],
        };
      }
      const id = parsedUrl.searchParams.get("symbolId");
      requestedIds.push(id);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          bestBid: id === "7" ? "100" : "200",
          bestAsk: id === "7" ? "102" : "204",
        }),
      };
    },
  });

  assert.deepEqual(requestedIds, ["7", "8"]);
  assert.deepEqual(quotes, {
    BTC: { bid: 100, ask: 102 },
    ETH: { bid: 200, ask: 204 },
  });
});

test("FXTF parser selects JPY crypto CFD quotes from the official feed", () => {
  assert.deepEqual(
    parseFxtfRates({
      feed: [
        { data: { symbol: "BTCJPY_CFD", bid: 100, ask: 100 } },
        { data: { symbol: "ETHJPY_CFD", bid: 200, ask: 202 } },
        { data: { symbol: "BTCUSD_CFD", bid: 60_000, ask: 60_010 } },
        { data: { symbol: "USDJPY", bid: 150, ask: 150.01 } },
      ],
    }),
    {
      BTC: { bid: 100, ask: 100 },
      ETH: { bid: 200, ask: 202 },
    },
  );
});
