import { RUNTIME_DEFAULTS } from "./config.mjs";

export const BPJ_VCT_SOURCE_URLS = Object.freeze({
  bitpointDealer: "https://www.bitpoint.co.jp/pricedata/twoway/normal-price.json",
  sbivcDealer: "https://www.sbivc.co.jp/api/get_priceFeedList_all",
});

const MAX_REQUEST_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 250;

export async function collectBpjVctSources({
  fetchImpl = globalThis.fetch,
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
} = {}) {
  validateFetch(fetchImpl);

  const [bitpointBody, sbivcBody] = await Promise.all([
    requestJson("BITPOINT", BPJ_VCT_SOURCE_URLS.bitpointDealer, {
      fetchImpl,
      timeoutMs,
      headers: {
        accept: "application/json, text/plain, */*",
        referer: "https://www.bitpoint.co.jp/chart/price-list/",
      },
    }),
    requestJson("SBI VC", BPJ_VCT_SOURCE_URLS.sbivcDealer, {
      fetchImpl,
      timeoutMs,
      headers: { accept: "application/json" },
    }),
  ]);

  const bpj = parseBitpointDealerRates(bitpointBody);
  const vct = parseSbivcDealerRates(sbivcBody);
  requireReferenceQuote(bpj.quotes, "BITPOINT");
  requireReferenceQuote(vct.quotes, "SBI VC");

  return { bpj, vct };
}

export function parseBitpointDealerRates(body) {
  const quotes = {};
  for (const row of Array.isArray(body?.ticker) ? body.ticker : []) {
    const match = /^([A-Z0-9]+)JPY$/.exec(String(row?.symbol || "").toUpperCase());
    if (!match) continue;
    const symbol = match[1] === "LNK" ? "LINK" : match[1];
    assignQuote(quotes, symbol, row?.bidPrice, row?.askPrice);
  }
  return {
    updatedAt: normalizeTimestamp(body?.createdAt ?? body?.timestamp),
    quotes,
  };
}

export function parseSbivcDealerRates(body) {
  const quotes = {};
  const timestamps = [];
  const rates = Array.isArray(body?.body?.rate)
    ? body.body.rate
    : (Array.isArray(body?.rate) ? body.rate : []);

  for (const row of rates) {
    const match = /^EX_([A-Z0-9]+)\/JPY$/.exec(String(row?.[0] || "").toUpperCase());
    if (!match || row?.[2]?.[4] === false || row?.[3]?.[4] === false) continue;
    assignQuote(quotes, match[1], row?.[2]?.[0], row?.[3]?.[0]);
    const timestamp = timestampMs(row?.[1]);
    if (timestamp !== null) timestamps.push(timestamp);
  }

  const responseTimestamp = timestampMs(
    body?.meta?.timestamp ?? body?.body?.timestamp ?? body?.timestamp,
  );
  const latestTimestamp = responseTimestamp
    ?? (timestamps.length > 0 ? Math.max(...timestamps) : null);
  return {
    updatedAt: latestTimestamp === null ? null : new Date(latestTimestamp).toISOString(),
    quotes,
  };
}

async function requestJson(sourceName, url, options) {
  const response = await request(sourceName, url, options);
  try {
    if (typeof response.json === "function") return await response.json();
    return JSON.parse(await response.text());
  } catch {
    throw new Error(`${sourceName} returned invalid JSON`);
  }
}

async function request(sourceName, url, {
  fetchImpl,
  timeoutMs,
  headers,
} = {}) {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          "user-agent": RUNTIME_DEFAULTS.userAgent,
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (attempt === MAX_REQUEST_ATTEMPTS) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${sourceName} request failed: ${detail}`);
      }
      await retryDelay(attempt);
      continue;
    }

    if (response?.ok) return response;
    const status = Number(response?.status);
    const retryable = status === 408 || status === 429 || status >= 500;
    if (!retryable || attempt === MAX_REQUEST_ATTEMPTS) {
      throw new Error(`${sourceName} request failed: HTTP ${response?.status ?? "unknown"}`);
    }
    await retryDelay(attempt);
  }
  throw new Error(`${sourceName} request failed after retries`);
}

function assignQuote(quotes, symbol, bid, ask) {
  const parsedBid = parsePositiveNumber(bid);
  const parsedAsk = parsePositiveNumber(ask);
  if (parsedBid === null || parsedAsk === null || parsedAsk < parsedBid) return;
  quotes[symbol] = { bid: parsedBid, ask: parsedAsk };
}

function parsePositiveNumber(value) {
  const number = typeof value === "string"
    ? Number(value.replaceAll(",", ""))
    : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeTimestamp(value) {
  const milliseconds = timestampMs(value);
  return milliseconds === null ? null : new Date(milliseconds).toISOString();
}

function timestampMs(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1_000 : numeric;
    return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function requireReferenceQuote(quotes, sourceName) {
  if (!quotes?.BTC) {
    throw new Error(`${sourceName} did not return a valid BTCJPY dealer quote`);
  }
}

function validateFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch API is unavailable");
}

function retryDelay(attempt) {
  const delayMs = INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1);
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
