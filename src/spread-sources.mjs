import { RUNTIME_DEFAULTS } from "./config.mjs";

export const SPREAD_SOURCE_URLS = Object.freeze({
  sbivcListings: "https://www.sbivc.co.jp/services/service-overview",
  sbivcRates: "https://www.sbivc.co.jp/api/get_priceFeedList_all",
  bitflyerSpot: "https://bitflyer.com/api/app/market/price2",
  bitflyerLeverage: "https://api.bitflyer.com/v1/getboard?product_code=FX_BTC_JPY",
  coincheck: "https://coincheck.com/front_api/marketplace_rates",
  gmoSpot: "https://coin.z.com/api/v1/master/getCurrentRate.json",
  gmoExchange: "https://api.coin.z.com/public/v1/ticker",
  bitbank: "https://public.bitbank.cc/dealer/feed",
  okj: "https://www.okj.com/v2/asset/transaction/public/currencies?checkOnline=true&dynamicQuotePrecision=true",
});

const GMO_DEALER_PRODUCT_IDS = Object.freeze({
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
  1034: "ZPGAG",
  1035: "ZPGPT",
});
const MAX_REQUEST_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 250;
const BITFLYER_SPOT_BATCH_SIZE = 6;

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
        spot: {
          bf: await fetchBitflyerSpot(listings.spot, { fetchImpl, timeoutMs }),
        },
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

export function parseBitflyerSpotRate(body) {
  const quotes = {};
  if (body?.status !== undefined && Number(body.status) !== 0) return quotes;

  const row = body?.data;
  const match = /^([A-Z0-9]+)_JPY$/.exec(
    String(row?.product_code || "").toUpperCase(),
  );
  if (!match || row?.enable_bid === false || row?.enable_ask === false) {
    return quotes;
  }
  assignQuote(quotes, match[1], row?.bid, row?.ask);
  return quotes;
}

export function parseGmoDealerRates(body) {
  const quotes = {};
  for (const row of body?.data || []) {
    const symbol = GMO_DEALER_PRODUCT_IDS[String(row?.productId ?? "")];
    if (
      !symbol
      || row?.bidValidFlag === false
      || row?.askValidFlag === false
    ) {
      continue;
    }
    assignQuote(quotes, symbol, row?.bid, row?.ask);
  }
  return quotes;
}

export function parseGmoExchangeRates(body) {
  const leverage = {};
  if (body?.status !== undefined && Number(body.status) !== 0) {
    return leverage;
  }

  for (const row of body?.data || []) {
    const match = /^([A-Z][A-Z0-9]{1,15})_JPY$/.exec(
      String(row?.symbol || "").toUpperCase(),
    );
    if (!match) continue;
    assignQuote(leverage, match[1], row?.bid, row?.ask);
  }
  return leverage;
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

export async function fetchBitflyerSpot(targetSymbols, options) {
  const quotes = {};
  const symbols = [...new Set(
    (Array.isArray(targetSymbols) ? targetSymbols : [])
      .map((symbol) => String(symbol).trim().toUpperCase())
      .filter((symbol) => /^[A-Z][A-Z0-9]{1,15}$/.test(symbol)),
  )];

  for (let index = 0; index < symbols.length; index += BITFLYER_SPOT_BATCH_SIZE) {
    const batch = symbols.slice(index, index + BITFLYER_SPOT_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (symbol) => {
      const productCode = `${symbol}_JPY`;
      const url = `${SPREAD_SOURCE_URLS.bitflyerSpot}?product_code=${encodeURIComponent(productCode)}`;
      return parseBitflyerSpotRate(await requestJson(url, options));
    }));
    for (const result of results) {
      if (result.status === "fulfilled") Object.assign(quotes, result.value);
    }
  }

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

async function fetchGmo(options) {
  const [dealerBody, exchangeBody] = await Promise.all([
    requestJson(SPREAD_SOURCE_URLS.gmoSpot, options),
    requestJson(SPREAD_SOURCE_URLS.gmoExchange, options),
  ]);
  const spot = requireQuotes(
    parseGmoDealerRates(dealerBody),
    "GMO spot dealer",
  );
  const leverage = requireQuotes(
    parseGmoExchangeRates(exchangeBody),
    "GMO leverage",
  );
  return { spot: { gmo: spot }, leverage: { gmo: leverage } };
}

async function fetchBitbank(options) {
  return requireQuotes(
    parseBitbankRates(await requestJson(SPREAD_SOURCE_URLS.bitbank, options)),
    "bitbank",
  );
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
    throw new Error(`${sourceName} did not return any valid two-way quotes`);
  }
  return quotes;
}
