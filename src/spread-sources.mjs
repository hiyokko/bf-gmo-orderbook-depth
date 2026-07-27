import { RUNTIME_DEFAULTS } from "./config.mjs";

export const SPREAD_SOURCE_URLS = Object.freeze({
  sbivcListings: "https://www.sbivc.co.jp/services/service-overview",
  sbivcRates: "https://www.sbivc.co.jp/api/get_priceFeedList_all",
  bitflyerSpot: "https://bitflyer.com/api/app/market/price2",
  bitflyerLeverage: "https://api.bitflyer.com/v1/getboard?product_code=FX_BTC_JPY",
  coincheck: "https://coincheck.com/front_api/marketplace_rates",
  gmo: "https://api.coin.z.com/public/v1/ticker",
  bitbank: "https://public.bitbank.cc/dealer/feed",
  okj: "https://www.okj.com/v2/asset/transaction/public/currencies?checkOnline=true&dynamicQuotePrecision=true",
  sbifx: "https://trade.sbifxt.co.jp/api_crypto/HttpApi/Rate.aspx",
  rakutenSymbols: "https://exchange.rakuten-wallet.co.jp/api/v1/cfd/symbol?authority=PERSONAL",
  rakutenOrderbook: "https://exchange.rakuten-wallet.co.jp/api/v1/orderbook",
  fxtf: "https://api.fxtrade.co.jp/live/getrategx",
});

const MAX_REQUEST_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 250;
const BITFLYER_SPOT_BATCH_SIZE = 6;
const RAKUTEN_REQUEST_INTERVAL_MS = 210;
const SBIFX_LEVERAGE_SYMBOLS = Object.freeze(["BTC", "XRP", "ETH"]);

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
    {
      markets: ["leverage"],
      venues: ["sbifx"],
      run: async () => ({
        leverage: {
          sbifx: await fetchSbifxLeverage(listings.leverage, {
            fetchImpl,
            timeoutMs,
          }),
        },
      }),
    },
    {
      markets: ["leverage"],
      venues: ["rw"],
      run: async () => ({
        leverage: {
          rw: await fetchRakutenLeverage(listings.leverage, {
            fetchImpl,
            timeoutMs,
          }),
        },
      }),
    },
    {
      markets: ["leverage"],
      venues: ["fxtf"],
      run: async () => ({
        leverage: { fxtf: await fetchFxtfLeverage({ fetchImpl, timeoutMs }) },
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

export function parseGmoRates(body) {
  const spot = {};
  const leverage = {};
  if (body?.status !== undefined && Number(body.status) !== 0) {
    return { spot: { gmo: spot }, leverage: { gmo: leverage } };
  }

  for (const row of body?.data || []) {
    const match = /^([A-Z][A-Z0-9]{1,15})(_JPY)?$/.exec(
      String(row?.symbol || "").toUpperCase(),
    );
    if (!match) continue;
    assignQuote(match[2] ? leverage : spot, match[1], row?.bid, row?.ask);
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

export function parseSbifxRate(body, expectedSymbol) {
  const symbol = String(expectedSymbol || "").trim().toUpperCase();
  if (!SBIFX_LEVERAGE_SYMBOLS.includes(symbol)) return {};

  const row = String(body || "")
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${symbol}JPY\t`));
  if (!row) return {};

  const fields = row.split("\t");
  const quotes = {};
  assignQuote(quotes, symbol, fields[4], fields[5]);
  return quotes;
}

export function parseRakutenSymbols(body) {
  const products = new Map();
  for (const row of Array.isArray(body) ? body : []) {
    const symbol = String(row?.baseCurrency || "").trim().toUpperCase();
    const id = Number(row?.id);
    if (
      row?.authority !== "PERSONAL"
      || row?.tradeType !== "CFD"
      || row?.quoteCurrency !== "JPY"
      || row?.enabled !== true
      || row?.closeOnly === true
      || row?.viewOnly === true
      || !/^[A-Z][A-Z0-9]{1,15}$/.test(symbol)
      || !Number.isSafeInteger(id)
      || id <= 0
    ) {
      continue;
    }
    products.set(symbol, id);
  }
  return products;
}

export function parseRakutenOrderbook(body) {
  const bids = validPrices(body?.bids);
  const asks = validPrices(body?.asks);
  return quoteFrom(
    body?.bestBid ?? (bids.length > 0 ? Math.max(...bids) : null),
    body?.bestAsk ?? (asks.length > 0 ? Math.min(...asks) : null),
  );
}

export function parseFxtfRates(body) {
  const quotes = {};
  for (const item of body?.feed || []) {
    const match = /^([A-Z0-9]+)JPY_CFD$/.exec(
      String(item?.data?.symbol || "").toUpperCase(),
    );
    if (!match) continue;
    assignQuote(quotes, match[1], item?.data?.bid, item?.data?.ask);
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

export async function fetchSbifxLeverage(targetSymbols, options) {
  const targets = normalizedTargetSymbols(targetSymbols)
    .filter((symbol) => SBIFX_LEVERAGE_SYMBOLS.includes(symbol));
  const results = await Promise.allSettled(targets.map(async (symbol) => {
    const body = await requestText(SPREAD_SOURCE_URLS.sbifx, {
      ...options,
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://www.sbifxt.co.jp",
        referer: "https://www.sbifxt.co.jp/",
      },
      body: new URLSearchParams({
        CURID: `${symbol}JPY`,
        AMOUNT: "1",
        GUID: "SBIFXTHP",
      }).toString(),
    });
    return parseSbifxRate(body, symbol);
  }));

  const quotes = {};
  for (const result of results) {
    if (result.status === "fulfilled") Object.assign(quotes, result.value);
  }
  return requireQuotes(quotes, "SBI FX leverage");
}

export async function fetchRakutenLeverage(targetSymbols, {
  requestIntervalMs = RAKUTEN_REQUEST_INTERVAL_MS,
  ...options
} = {}) {
  const products = parseRakutenSymbols(
    await requestJson(SPREAD_SOURCE_URLS.rakutenSymbols, options),
  );
  const targets = normalizedTargetSymbols(targetSymbols)
    .filter((symbol) => products.has(symbol));
  const quotes = {};

  for (const [index, symbol] of targets.entries()) {
    if (index > 0 && requestIntervalMs > 0) {
      await delay(requestIntervalMs);
    }
    const url = new URL(SPREAD_SOURCE_URLS.rakutenOrderbook);
    url.searchParams.set("symbolId", String(products.get(symbol)));
    const quote = parseRakutenOrderbook(await requestJson(url.toString(), options));
    if (quote) quotes[symbol] = quote;
  }

  return requireQuotes(quotes, "Rakuten Wallet leverage");
}

export async function fetchFxtfLeverage(options) {
  const body = await requestJson(SPREAD_SOURCE_URLS.fxtf, {
    ...options,
    headers: {
      accept: "application/json",
      origin: "https://www.fxtrade.co.jp",
      referer: "https://www.fxtrade.co.jp/crypto/rate/",
    },
  });
  return requireQuotes(parseFxtfRates(body), "FXTF leverage");
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

function normalizedTargetSymbols(targetSymbols) {
  return [...new Set(
    (Array.isArray(targetSymbols) ? targetSymbols : [])
      .map((symbol) => String(symbol).trim().toUpperCase())
      .filter((symbol) => /^[A-Z][A-Z0-9]{1,15}$/.test(symbol)),
  )];
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

function delay(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function requireQuotes(quotes, sourceName) {
  if (!quotes || Object.keys(quotes).length === 0) {
    throw new Error(`${sourceName} did not return any valid two-way quotes`);
  }
  return quotes;
}
