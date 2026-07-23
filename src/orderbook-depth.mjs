export const TARGETS = Object.freeze([0.1, 0.3, 0.5, 1, 3]);

export const EXCHANGES = Object.freeze([
  {
    name: "bitFlyer Crypto CFD",
    symbol: "FX_BTC_JPY",
    url: "https://api.bitflyer.com/v1/getboard?product_code=FX_BTC_JPY",
    parse(body) {
      if (!Array.isArray(body?.asks) || !Array.isArray(body?.bids)) {
        throw new Error("bitFlyer API returned an invalid order book");
      }
      return {
        asks: body.asks,
        bids: body.bids,
        sourceTime: null,
      };
    },
  },
  {
    name: "GMOコイン レバレッジ",
    symbol: "BTC_JPY",
    url: "https://api.coin.z.com/public/v1/orderbooks?symbol=BTC_JPY",
    parse(body) {
      if (body?.status !== 0) {
        throw new Error(`GMO API status ${body?.status ?? "unknown"}`);
      }
      if (!Array.isArray(body?.data?.asks) || !Array.isArray(body?.data?.bids)) {
        throw new Error("GMO API returned an invalid order book");
      }
      return {
        asks: body.data.asks,
        bids: body.data.bids,
        sourceTime: body.responsetime,
      };
    },
  },
]);

export function validateWebhookUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:"
      && url.hostname === "hooks.slack.com"
      && /^\/services\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function formatPrice(value, decimals = 0) {
  return Number(value).toLocaleString("ja-JP", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function consume(levels, target, direction) {
  if (!["BUY", "SELL"].includes(direction)) {
    throw new Error(`Unsupported direction: ${direction}`);
  }
  if (!Number.isFinite(target) || target <= 0) {
    throw new Error(`Invalid target quantity: ${target}`);
  }

  const sorted = levels
    .map(({ price, size }) => ({ price: Number(price), size: Number(size) }))
    .filter(({ price, size }) => Number.isFinite(price) && Number.isFinite(size) && size > 0)
    .sort((a, b) => direction === "BUY" ? a.price - b.price : b.price - a.price);

  if (sorted.length === 0) throw new Error(`${direction}: empty order book`);

  const best = sorted[0].price;
  let remaining = target;
  let notional = 0;
  let limit = null;
  let levelsUsed = 0;

  for (const level of sorted) {
    if (remaining <= 1e-12) break;
    const fill = Math.min(remaining, level.size);
    if (fill <= 0) continue;
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
  const impactBps = direction === "BUY"
    ? ((vwap / best) - 1) * 10_000
    : (1 - (vwap / best)) * 10_000;

  return {
    target,
    best,
    limit,
    vwap,
    impactBps,
    impactPercent: impactBps / 100,
    notional,
    levelsUsed,
    insufficient: false,
  };
}

function slackRow(result) {
  const quantity = String(result.target).padStart(3);
  if (result.insufficient) {
    return `${quantity} | 板不足（取得範囲 ${result.available.toFixed(4)} BTC）`;
  }
  return [
    quantity,
    formatPrice(result.limit).padStart(12),
    formatPrice(result.vwap, 1).padStart(14),
    `${result.impactBps.toFixed(2)}bp / ${result.impactPercent.toFixed(4)}%`.padStart(20),
  ].join(" | ");
}

export function createSlackText(snapshots, fetchedAtJst) {
  const blocks = snapshots.map((snapshot) => {
    const sourceTime = snapshot.sourceTime
      ? ` / API応答時刻 ${snapshot.sourceTime}`
      : "";
    return [
      `*${snapshot.name}* \`${snapshot.symbol}\`${sourceTime}`,
      "```",
      "数量 | 到達価格(JPY) | VWAP(JPY)      | 影響(bp / %)",
      "ASK / BUY（bestへ近づく順）",
      ...[...snapshot.buy].reverse().map(slackRow),
      "──────── BEST ────────",
      "BID / SELL（bestから離れる順）",
      ...snapshot.sell.map(slackRow),
      "```",
    ].join("\n");
  });

  return [
    "*レバBTC 板Depthスナップショット*",
    `取得時刻: ${fetchedAtJst} JST`,
    "価格影響 = 最良気配に対するVWAPの悪化幅（手数料・スプレッド外コストは除外）",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

function createTimeoutSignal(timeoutMs) {
  return AbortSignal.timeout(timeoutMs);
}

export async function fetchSnapshots({
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is unavailable");
  }

  return Promise.all(EXCHANGES.map(async (exchange) => {
    const response = await fetchImpl(exchange.url, {
      headers: { "User-Agent": "bf-gmo-orderbook-depth/1.0" },
      signal: createTimeoutSignal(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`${exchange.name}: HTTP ${response.status}`);
    }
    const parsed = exchange.parse(await response.json());
    return {
      name: exchange.name,
      symbol: exchange.symbol,
      apiUrl: exchange.url,
      sourceTime: parsed.sourceTime,
      buy: TARGETS.map((target) => consume(parsed.asks, target, "BUY")),
      sell: TARGETS.map((target) => consume(parsed.bids, target, "SELL")),
    };
  }));
}

export async function postToSlack(text, webhookUrl, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  if (!validateWebhookUrl(webhookUrl)) {
    throw new Error("Slack Webhook URL is missing or invalid");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is unavailable");
  }

  const response = await fetchImpl(webhookUrl.trim(), {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ text }),
    signal: createTimeoutSignal(timeoutMs),
  });
  const responseBody = await response.text();
  if (!response.ok || responseBody.trim() !== "ok") {
    throw new Error(`Slack webhook failed: HTTP ${response.status} ${responseBody}`);
  }
  return responseBody.trim();
}

export function formatJst(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function createReport({ snapshots, fetchedAt, slack }) {
  return {
    fetchedAt: fetchedAt.toISOString(),
    fetchedAtJst: formatJst(fetchedAt),
    targets: [...TARGETS],
    displayOrder: {
      askBuy: [...TARGETS].reverse(),
      bidSell: [...TARGETS],
    },
    methodology: {
      buy: "asksを価格昇順に累積",
      sell: "bidsを価格降順に累積",
      impactBps: "最良気配に対するVWAPの不利方向への乖離",
      impactPercent: "impactBps / 100",
      excludes: ["取引手数料", "資金調達料", "API取得後の板変動"],
    },
    slack,
    exchanges: snapshots,
  };
}
