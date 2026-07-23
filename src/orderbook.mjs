import {
  DEPTH_TARGETS,
  RUNTIME_DEFAULTS,
} from "./config.mjs";

export const EXCHANGES = Object.freeze([
  Object.freeze({
    id: "bitflyer",
    name: "bitFlyer Crypto CFD",
    symbol: "FX_BTC_JPY",
    url: "https://api.bitflyer.com/v1/getboard?product_code=FX_BTC_JPY",
    parse: parseBitFlyerOrderBook,
  }),
  Object.freeze({
    id: "gmo",
    name: "GMOコイン レバレッジ",
    symbol: "BTC_JPY",
    url: "https://api.coin.z.com/public/v1/orderbooks?symbol=BTC_JPY",
    parse: parseGmoOrderBook,
  }),
]);

export function parseBitFlyerOrderBook(body) {
  if (!Array.isArray(body?.asks) || !Array.isArray(body?.bids)) {
    throw new Error("bitFlyer API returned an invalid order book");
  }
  return {
    asks: body.asks,
    bids: body.bids,
    sourceTime: null,
  };
}

export function parseGmoOrderBook(body) {
  if (body?.status !== 0) {
    throw new Error(`GMO API status ${body?.status ?? "unknown"}`);
  }
  if (!Array.isArray(body?.data?.asks) || !Array.isArray(body?.data?.bids)) {
    throw new Error("GMO API returned an invalid order book");
  }
  return {
    asks: body.data.asks,
    bids: body.data.bids,
    sourceTime: body.responsetime ?? null,
  };
}

export function calculateDepth(levels, target, direction, referencePrice) {
  return consumeSortedLevels(
    normalizeLevels(levels, direction),
    target,
    direction,
    requireReferencePrice(referencePrice),
  );
}

export function calculateDepths(levels, targets, direction, referencePrice) {
  const normalized = normalizeLevels(levels, direction);
  const reference = requireReferencePrice(referencePrice);
  return calculateNormalizedDepths(normalized, targets, direction, reference);
}

export async function fetchSnapshots({
  exchanges = EXCHANGES,
  targets = DEPTH_TARGETS,
  fetchImpl = globalThis.fetch,
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
} = {}) {
  requireFetch(fetchImpl);
  return Promise.all(
    exchanges.map((exchange) => fetchExchangeSnapshot(exchange, {
      targets,
      fetchImpl,
      timeoutMs,
    })),
  );
}

export async function fetchExchangeSnapshot(exchange, {
  targets = DEPTH_TARGETS,
  fetchImpl = globalThis.fetch,
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
} = {}) {
  requireFetch(fetchImpl);
  validateExchange(exchange);

  const response = await fetchImpl(exchange.url, {
    headers: { "User-Agent": RUNTIME_DEFAULTS.userAgent },
    signal: createTimeoutSignal(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${exchange.name}: HTTP ${response.status}`);
  }

  const parsed = exchange.parse(await response.json());
  const asks = normalizeLevels(parsed.asks, "BUY");
  const bids = normalizeLevels(parsed.bids, "SELL");
  const bestAsk = asks[0].price;
  const bestBid = bids[0].price;
  const mid = (bestAsk + bestBid) / 2;

  return {
    name: exchange.name,
    symbol: exchange.symbol,
    apiUrl: exchange.url,
    sourceTime: parsed.sourceTime,
    bestAsk,
    bestBid,
    mid,
    buy: calculateNormalizedDepths(asks, targets, "BUY", mid),
    sell: calculateNormalizedDepths(bids, targets, "SELL", mid),
  };
}

function calculateNormalizedDepths(levels, targets, direction, referencePrice) {
  return targets.map((target) => (
    consumeSortedLevels(levels, target, direction, referencePrice)
  ));
}

function normalizeLevels(levels, direction) {
  if (!["BUY", "SELL"].includes(direction)) {
    throw new Error(`Unsupported direction: ${direction}`);
  }
  if (!Array.isArray(levels)) {
    throw new Error(`${direction}: order book levels must be an array`);
  }

  const normalized = levels
    .map(({ price, size } = {}) => ({
      price: Number(price),
      size: Number(size),
    }))
    .filter(({ price, size }) => (
      Number.isFinite(price)
      && price > 0
      && Number.isFinite(size)
      && size > 0
    ))
    .sort((left, right) => (
      direction === "BUY"
        ? left.price - right.price
        : right.price - left.price
    ));

  if (normalized.length === 0) {
    throw new Error(`${direction}: empty order book`);
  }
  return normalized;
}

function consumeSortedLevels(levels, target, direction, referencePrice) {
  if (!Number.isFinite(target) || target <= 0) {
    throw new Error(`Invalid target quantity: ${target}`);
  }

  const best = levels[0].price;
  let remaining = target;
  let notional = 0;
  let limit = null;
  let levelsUsed = 0;

  for (const level of levels) {
    if (remaining <= 1e-12) break;
    const fill = Math.min(remaining, level.size);
    notional += fill * level.price;
    remaining -= fill;
    limit = level.price;
    levelsUsed += 1;
  }

  if (remaining > 1e-9) {
    return {
      target,
      available: target - remaining,
      insufficient: true,
    };
  }

  const vwap = notional / target;
  const limitImpactBps = calculateAdverseImpactBps(limit, referencePrice, direction);
  const vwapImpactBps = calculateAdverseImpactBps(vwap, referencePrice, direction);

  return {
    target,
    best,
    referencePrice,
    limit,
    vwap,
    limitImpactBps,
    limitImpactPercent: limitImpactBps / 100,
    vwapImpactBps,
    vwapImpactPercent: vwapImpactBps / 100,
    notional,
    levelsUsed,
    insufficient: false,
  };
}

function calculateAdverseImpactBps(price, referencePrice, direction) {
  return direction === "BUY"
    ? ((price / referencePrice) - 1) * 10_000
    : (1 - (price / referencePrice)) * 10_000;
}

function requireReferencePrice(value) {
  const referencePrice = Number(value);
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new Error(`Invalid impact reference price: ${value}`);
  }
  return referencePrice;
}

function validateExchange(exchange) {
  if (
    !exchange
    || typeof exchange.name !== "string"
    || typeof exchange.symbol !== "string"
    || typeof exchange.url !== "string"
    || typeof exchange.parse !== "function"
  ) {
    throw new Error("Exchange configuration is invalid");
  }
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is unavailable");
  }
}

function createTimeoutSignal(timeoutMs) {
  const value = Number(timeoutMs);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid request timeout: ${timeoutMs}`);
  }
  return AbortSignal.timeout(value);
}
