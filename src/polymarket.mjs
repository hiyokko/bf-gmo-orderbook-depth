import {
  CLARITY_HISTORY_SERIES,
  CLARITY_MARKET,
  RUNTIME_DEFAULTS,
} from "./config.mjs";

export async function fetchClarityMarket({
  fetchImpl = globalThis.fetch,
  fetchedAt = new Date(),
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
  historyTimeoutMs = CLARITY_MARKET.historyTimeoutMs,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch API is unavailable");
  if (!(fetchedAt instanceof Date) || Number.isNaN(fetchedAt.getTime())) {
    throw new Error("Fetched time must be a valid Date");
  }

  const event = await requestJson(CLARITY_MARKET.gammaUrl, {
    fetchImpl,
    timeoutMs,
    label: "Polymarket event",
  });
  const market = parseClarityEvent(event);
  const historyResults = await Promise.all(
    CLARITY_HISTORY_SERIES.map(async (series) => {
      try {
        const historyUrl = createHistoryUrl(market.yesTokenId, series);
        const historyBody = await requestJson(historyUrl, {
          fetchImpl,
          timeoutMs: historyTimeoutMs,
          label: `Polymarket ${series.id} price history`,
        });
        return {
          id: series.id,
          history: parsePriceHistory(
            historyBody,
            fetchedAt,
            market.yesProbability,
          ),
          error: null,
        };
      } catch (error) {
        return {
          id: series.id,
          history: null,
          error: toError(error).message,
        };
      }
    }),
  );
  const allHistory = historyResults.find(({ id }) => id === "all");
  if (!allHistory?.history) {
    throw new Error(allHistory?.error || "Polymarket all price history failed");
  }
  const histories = Object.fromEntries(
    historyResults
      .filter(({ history }) => history)
      .map(({ id, history }) => [id, history]),
  );
  const historyErrors = Object.fromEntries(
    historyResults
      .filter(({ error }) => error)
      .map(({ id, error }) => [id, error]),
  );

  return {
    ...market,
    sourceUrl: CLARITY_MARKET.pageUrl,
    fetchedAt: fetchedAt.toISOString(),
    history: histories.all,
    periodHistories: Object.fromEntries(
      ["month", "week"]
        .filter((id) => histories[id])
        .map((id) => [id, histories[id]]),
    ),
    periodHistoryErrors: historyErrors,
  };
}

export function parseClarityEvent(event) {
  if (!event || typeof event !== "object") {
    throw new Error("Polymarket event response is invalid");
  }

  const markets = Array.isArray(event.markets) ? event.markets : [];
  for (const market of markets) {
    const outcomes = parseArrayField(market?.outcomes);
    const prices = parseArrayField(market?.outcomePrices);
    const tokenIds = parseArrayField(market?.clobTokenIds);
    const yesIndex = outcomes.findIndex(
      (outcome) => String(outcome).toLowerCase() === "yes",
    );
    if (yesIndex < 0) continue;

    const yesProbability = Number(prices[yesIndex]);
    const yesTokenId = String(tokenIds[yesIndex] || "").trim();
    if (
      !Number.isFinite(yesProbability)
      || yesProbability < 0
      || yesProbability > 1
      || !/^\d+$/.test(yesTokenId)
    ) {
      continue;
    }

    return {
      eventId: String(event.id || ""),
      marketId: String(market.id || ""),
      title: String(market.question || event.title || "").trim(),
      active: event.active !== false && market.active !== false,
      closed: event.closed === true || market.closed === true,
      endDate: event.endDate || market.endDate || null,
      yesTokenId,
      yesProbability,
      volume: finiteNumber(market.volume ?? event.volume),
      liquidity: finiteNumber(market.liquidity ?? event.liquidity),
    };
  }

  throw new Error("Polymarket YES market or token ID is unavailable");
}

export function parsePriceHistory(body, fetchedAt, currentProbability) {
  const fetchedAtSeconds = Math.floor(fetchedAt.getTime() / 1000);
  const byTimestamp = new Map();

  for (const point of Array.isArray(body?.history) ? body.history : []) {
    const timestamp = Number(point?.t);
    const probability = Number(point?.p);
    if (
      !Number.isFinite(timestamp)
      || timestamp <= 0
      || timestamp > fetchedAtSeconds + 300
      || !Number.isFinite(probability)
      || probability < 0
      || probability > 1
    ) {
      continue;
    }
    byTimestamp.set(Math.trunc(timestamp), probability);
  }

  byTimestamp.set(fetchedAtSeconds, currentProbability);
  const history = [...byTimestamp]
    .sort(([left], [right]) => left - right)
    .map(([timestamp, probability]) => ({ timestamp, probability }));
  if (history.length < 2) {
    throw new Error("Polymarket price history has insufficient valid points");
  }
  return history;
}

async function requestJson(url, {
  fetchImpl,
  timeoutMs,
  label,
}) {
  let response;
  try {
    response = await fetchImpl(String(url), {
      headers: {
        accept: "application/json",
        "user-agent": RUNTIME_DEFAULTS.userAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`${label} failed: ${toError(error).message}`);
  }
  if (!response.ok) {
    throw new Error(`${label} failed: HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

function parseArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function createHistoryUrl(tokenId, series) {
  const historyUrl = new URL(CLARITY_MARKET.historyUrl);
  historyUrl.searchParams.set("market", tokenId);
  historyUrl.searchParams.set("interval", series.interval);
  historyUrl.searchParams.set("fidelity", String(series.fidelityMinutes));
  return historyUrl;
}

function toError(error) {
  return error instanceof Error ? error : new Error(String(error));
}
