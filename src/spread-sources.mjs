import { RUNTIME_DEFAULTS } from "./config.mjs";

export const SPREAD_SOURCE_URLS = Object.freeze({
  sbivcListings: "https://www.sbivc.co.jp/services/service-overview",
  sbivcRates: "https://www.sbivc.co.jp/api/get_priceFeedList_all",
  bitflyerSpot: "https://bitflyer.com/api/echo/price",
  bitflyerLeverage: "https://api.bitflyer.com/v1/getboard?product_code=FX_BTC_JPY",
  coincheck: "https://coincheck.com/front_api/marketplace_rates",
  bitpoint: "https://www.bitpoint.co.jp/pricedata/twoway/normal-price.json",
  gmo: "https://coin.z.com/api/v1/master/getCurrentRate.json",
  bitbank: "https://public.bitbank.cc/dealer/feed",
  cointradeMaster: "https://coin-trade.cc/assets/json/currencyMaster.json",
  cointradeRates: "https://trade.sf.coin-trade.cc/cccmdipresen/gw/market",
  okj: "https://www.okj.com/v2/asset/transaction/public/currencies?checkOnline=true&dynamicQuotePrecision=true",
});

const GMO_SPOT_PRODUCT_IDS = Object.freeze({
  1001: "BTC",
  1002: "ETH",
  1003: "BCH",
  1004: "LTC",
  1005: "XRP",
  1007: "XLM",
  1013: "DOT",
  1014: "ATOM",
  1020: "ADA",
  1021: "LINK",
  1022: "DOGE",
  1023: "SOL",
  1026: "FIL",
  1027: "SAND",
  1028: "CHZ",
  1030: "AVAX",
  1032: "SUI",
  1033: "ZPG",
});

const GMO_LEVERAGE_PRODUCT_IDS = Object.freeze({
  10001: "BTC",
  10002: "ETH",
  10003: "BCH",
  10004: "LTC",
  10005: "XRP",
  10007: "XLM",
  10013: "DOT",
  10014: "ATOM",
  10020: "ADA",
  10021: "LINK",
  10022: "DOGE",
  10023: "SOL",
});
const MAX_REQUEST_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 250;

export async function collectSpreadSources({
  fetchImpl = globalThis.fetch,
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
} = {}) {
  validateFetch(fetchImpl);
  const listingsHtml = await requestText(SPREAD_SOURCE_URLS.sbivcListings, {
    fetchImpl,
    timeoutMs,
  });
  const listings = parseSbivcListings(listingsHtml);
  const quotes = createEmptyMarketMap();
  const errors = createEmptyMarketMap();

  const tasks = [
    {
      markets: ["spot", "leverage"],
      venues: ["sbivc"],
      run: () => fetchSbivcQuotes({ fetchImpl, timeoutMs }),
    },
    {
      markets: ["spot"],
      venues: ["bf"],
      run: async () => ({
        spot: { bf: await fetchBitflyerSpot({ fetchImpl, timeoutMs }) },
      }),
    },
    {
      markets: ["leverage"],
      venues: ["bf"],
      run: async () => ({
        leverage: { bf: await fetchBitflyerLeverage({ fetchImpl, timeoutMs }) },
      }),
    },
    {
      markets: ["spot"],
      venues: ["cc"],
      run: async () => ({
        spot: { cc: await fetchCoincheck({ fetchImpl, timeoutMs }) },
      }),
    },
    {
      markets: ["spot"],
      venues: ["bp"],
      run: async () => ({
        spot: { bp: await fetchBitpoint({ fetchImpl, timeoutMs }) },
      }),
    },
    {
      markets: ["spot", "leverage"],
      venues: ["gmo"],
      run: () => fetchGmo({ fetchImpl, timeoutMs }),
    },
    {
      markets: ["spot"],
      venues: ["bb"],
      run: async () => ({
        spot: { bb: await fetchBitbank({ fetchImpl, timeoutMs }) },
      }),
    },
    {
      markets: ["spot"],
      venues: ["ct"],
      run: async () => ({
        spot: {
          ct: await fetchCointrade(listings.spot, { fetchImpl, timeoutMs }),
        },
      }),
    },
    {
      markets: ["spot"],
      venues: ["okj"],
      run: async () => ({
        spot: { okj: await fetchOkj({ fetchImpl, timeoutMs }) },
      }),
    },
  ];

  await Promise.all(tasks.map(async (task) => {
    try {
      mergeMarkets(quotes, await task.run());
    } catch (error) {
      const message = publicErrorMessage(error);
      for (const market of task.markets) {
        for (const venue of task.venues) errors[market][venue] = message;
      }
    }
  }));

  return { listings, quotes, errors };
}

export function parseSbivcListings(html) {
  const spot = symbolsFromFirstTableAfter(html, "現物（販売所）");
  const leverage = symbolsFromFirstTableAfter(html, "レバレッジ（販売所）");
  if (spot.length < 10 || leverage.length < 3) {
    throw new Error("SBIVC listing page did not contain the expected product tables");
  }
  return { spot, leverage };
}

export function parseSbivcRates(body) {
  const spot = {};
  const leverage = {};
  const rates = Array.isArray(body?.body?.rate)
    ? body.body.rate
    : (Array.isArray(body?.rate) ? body.rate : []);

  for (const row of rates) {
    const match = /^(EX|CFD)_([A-Z0-9]+)\/JPY$/.exec(String(row?.[0] || ""));
    if (!match || row?.[2]?.[4] === false || row?.[3]?.[4] === false) continue;
    const quote = quoteFrom(row?.[2]?.[0], row?.[3]?.[0]);
    if (!quote) continue;
    (match[1] === "EX" ? spot : leverage)[match[2]] = quote;
  }
  return { spot: { sbivc: spot }, leverage: { sbivc: leverage } };
}

export function parseCoincheckRates(body) {
  const quotes = {};
  for (const row of body?.marketplace_rates || []) {
    const rawSymbol = String(row?.pair || "").split("_")[0].toUpperCase();
    const symbol = rawSymbol === "MATIC" ? "POL" : rawSymbol;
    assignQuote(quotes, symbol, row?.sell_rate, row?.buy_rate);
  }
  return quotes;
}

export function parseBitpointRates(body) {
  const quotes = {};
  for (const row of body?.ticker || []) {
    const rawSymbol = String(row?.symbol || "").replace(/JPY$/, "").toUpperCase();
    const symbol = rawSymbol === "LNK" ? "LINK" : rawSymbol;
    assignQuote(quotes, symbol, row?.bidPrice, row?.askPrice);
  }
  return quotes;
}

export function parseGmoRates(body) {
  const spot = {};
  const leverage = {};
  for (const row of body?.data || []) {
    const productId = String(row?.productId ?? "");
    const spotSymbol = GMO_SPOT_PRODUCT_IDS[productId];
    const leverageSymbol = GMO_LEVERAGE_PRODUCT_IDS[productId];
    if (spotSymbol) assignQuote(spot, spotSymbol, row?.bid, row?.ask);
    if (leverageSymbol) assignQuote(leverage, leverageSymbol, row?.bid, row?.ask);
  }
  return { spot: { gmo: spot }, leverage: { gmo: leverage } };
}

export function parseBitbankRates(body) {
  const quotes = {};
  for (const row of body?.data?.prices || []) {
    const rawSymbol = String(row?.asset || "").toUpperCase();
    const symbol = rawSymbol === "BCC" ? "BCH" : rawSymbol;
    assignQuote(quotes, symbol, row?.bid, row?.ask);
  }
  return quotes;
}

export function parseCointradeRates(body) {
  const quotes = {};
  for (const row of body?.body?.rate || []) {
    const match = /^EX_([A-Z0-9]+)\/JPY$/.exec(String(row?.[0] || ""));
    if (!match || row?.[2]?.[4] === false || row?.[3]?.[4] === false) continue;
    assignQuote(quotes, match[1], row?.[2]?.[0], row?.[3]?.[0]);
  }
  return quotes;
}

export function parseOkjRates(body) {
  const quotes = {};
  for (const row of body?.data || []) {
    const rawSymbol = String(row?.baseCurrencySymbol || "").toUpperCase();
    const symbol = rawSymbol === "CC" ? "CANTON" : rawSymbol;
    if (row?.isOnline === false) continue;
    assignQuote(quotes, symbol, row?.sellPrice, row?.buyPrice);
  }
  return quotes;
}

async function fetchSbivcQuotes(options) {
  const parsed = parseSbivcRates(
    await requestJson(SPREAD_SOURCE_URLS.sbivcRates, options),
  );
  requireQuotes(parsed.spot.sbivc, "SBIVC spot");
  requireQuotes(parsed.leverage.sbivc, "SBIVC leverage");
  return parsed;
}

async function fetchBitflyerSpot(options) {
  const body = await requestJson(SPREAD_SOURCE_URLS.bitflyerSpot, options);
  const quotes = {};
  assignQuote(quotes, "BTC", body?.bid, body?.ask);
  return requireQuotes(quotes, "bitFlyer spot");
}

async function fetchBitflyerLeverage(options) {
  const body = await requestJson(SPREAD_SOURCE_URLS.bitflyerLeverage, options);
  const asks = validPrices(body?.asks);
  const bids = validPrices(body?.bids);
  const quote = quoteFrom(
    bids.length > 0 ? Math.max(...bids) : null,
    asks.length > 0 ? Math.min(...asks) : null,
  );
  if (!quote) throw new Error("bitFlyer leverage board did not contain a valid best bid/ask");
  return { BTC: quote };
}

async function fetchCoincheck(options) {
  const body = await requestJson(SPREAD_SOURCE_URLS.coincheck, {
    ...options,
    headers: {
      accept: "application/json",
      referer: "https://coincheck.com/ja/exchange/prices",
      "x-requested-with": "XMLHttpRequest",
    },
  });
  return requireQuotes(parseCoincheckRates(body), "Coincheck");
}

async function fetchBitpoint(options) {
  return requireQuotes(
    parseBitpointRates(await requestJson(SPREAD_SOURCE_URLS.bitpoint, options)),
    "BITPOINT",
  );
}

async function fetchGmo(options) {
  const parsed = parseGmoRates(await requestJson(SPREAD_SOURCE_URLS.gmo, options));
  requireQuotes(parsed.spot.gmo, "GMO spot");
  requireQuotes(parsed.leverage.gmo, "GMO leverage");
  return parsed;
}

async function fetchBitbank(options) {
  return requireQuotes(
    parseBitbankRates(await requestJson(SPREAD_SOURCE_URLS.bitbank, options)),
    "bitbank",
  );
}

async function fetchCointrade(targetSymbols, options) {
  const master = await requestJson(SPREAD_SOURCE_URLS.cointradeMaster, options);
  const supported = new Set(
    (master?.currencies || [])
      .map((currency) => String(currency?.symbol || "").toUpperCase())
      .filter(Boolean),
  );
  const productIds = targetSymbols
    .filter((symbol) => supported.has(symbol))
    .map((symbol) => `EX_${symbol}/JPY`);
  if (productIds.length === 0) {
    throw new Error("CoinTrade currency master did not match any SBIVC symbols");
  }

  const body = await requestJson(SPREAD_SOURCE_URLS.cointradeRates, {
    ...options,
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify({
      event: "priceFeedList",
      data: { productIds },
    }),
  });
  if (body?.meta?.status && body.meta.status !== "OK") {
    throw new Error(`CoinTrade API returned status ${String(body.meta.status)}`);
  }
  return requireQuotes(parseCointradeRates(body), "CoinTrade");
}

async function fetchOkj(options) {
  const body = await requestJson(SPREAD_SOURCE_URLS.okj, {
    ...options,
    headers: {
      accept: "application/json",
      "app-type": "web",
    },
  });
  if (body?.code !== undefined && Number(body.code) !== 0) {
    throw new Error(`OKJ API returned code ${String(body.code)}`);
  }
  return requireQuotes(parseOkjRates(body), "OKJ");
}

async function requestJson(url, options = {}) {
  const response = await request(url, options);
  if (typeof response.json === "function") return response.json();
  return JSON.parse(await response.text());
}

async function requestText(url, options = {}) {
  const response = await request(url, options);
  return response.text();
}

async function request(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
  headers,
  ...options
} = {}) {
  validateFetch(fetchImpl);

  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...options,
        headers: {
          "user-agent": RUNTIME_DEFAULTS.userAgent,
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (attempt === MAX_REQUEST_ATTEMPTS) throw error;
      await retryDelay(attempt);
      continue;
    }

    if (response?.ok) return response;
    const status = Number(response?.status);
    const retryable = status === 408 || status === 429 || status >= 500;
    if (!retryable || attempt === MAX_REQUEST_ATTEMPTS) {
      throw new Error(`Price source request failed: HTTP ${response?.status ?? "unknown"}`);
    }
    await retryDelay(attempt);
  }

  throw new Error("Price source request failed after retries");
}

function symbolsFromFirstTableAfter(html, heading) {
  const source = String(html || "");
  const headingIndex = source.indexOf(heading);
  if (headingIndex < 0) return [];
  const table = source.slice(headingIndex).match(/<table\b[\s\S]*?<\/table>/i)?.[0] || "";
  const symbols = [];
  for (const row of table.matchAll(/<tr\b[^>]*class=["'][^"']*\bdata_row\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)) {
    const firstCell = row[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1] || "";
    const symbol = stripHtml(firstCell).trim().toUpperCase();
    if (/^[A-Z][A-Z0-9]{1,15}$/.test(symbol)) symbols.push(symbol);
  }
  return [...new Set(symbols)];
}

function stripHtml(value) {
  return String(value)
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ");
}

function validPrices(levels) {
  return (Array.isArray(levels) ? levels : [])
    .map((level) => parseNumber(level?.price))
    .filter((price) => price !== null);
}

function assignQuote(quotes, symbol, bid, ask) {
  if (!/^[A-Z][A-Z0-9]{1,15}$/.test(symbol)) return;
  const quote = quoteFrom(bid, ask);
  if (quote) quotes[symbol] = quote;
}

function quoteFrom(bid, ask) {
  const parsedBid = parseNumber(bid);
  const parsedAsk = parseNumber(ask);
  return parsedBid !== null && parsedAsk !== null && parsedAsk >= parsedBid
    ? { bid: parsedBid, ask: parsedAsk }
    : null;
}

function parseNumber(value) {
  const number = typeof value === "string"
    ? Number(value.replaceAll(",", ""))
    : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function createEmptyMarketMap() {
  return { spot: {}, leverage: {} };
}

function mergeMarkets(target, source) {
  for (const market of ["spot", "leverage"]) {
    Object.assign(target[market], source?.[market] || {});
  }
}

function publicErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/gi, "[URL]").slice(0, 240);
}

function validateFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch API is unavailable");
}

function retryDelay(attempt) {
  const delayMs = INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1);
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function requireQuotes(quotes, sourceName) {
  if (!quotes || Object.keys(quotes).length === 0) {
    throw new Error(`${sourceName} did not return any valid dealer quotes`);
  }
  return quotes;
}
