import {
  DISPLAY_TARGETS,
  RUNTIME_DEFAULTS,
} from "./config.mjs";

const COLUMN_WIDTHS = Object.freeze({
  quantity: 6,
  limit: 12,
  impact: 9,
});
const SLACK_WIDE_CHARACTER_WIDTH = 1.5;
const TABLE_HEADER = formatTableColumns("amount", "price", "impact");
const MID_SEPARATOR = "────────────────";

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

export function createSlackText(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error("At least one exchange snapshot is required");
  }

  const blocks = snapshots.map(formatExchangeBlock);
  return [
    "*レバBTC 板Depthスナップショット*",
    "impact = midからpriceまでの距離",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

export async function postToSlack(text, webhookUrl, {
  fetchImpl = globalThis.fetch,
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
} = {}) {
  return postPayloadToSlack({ text }, webhookUrl, { fetchImpl, timeoutMs });
}

export async function postPayloadToSlack(payload, webhookUrl, {
  fetchImpl = globalThis.fetch,
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
} = {}) {
  if (!validateWebhookUrl(webhookUrl)) {
    throw new Error("Slack Webhook URL is missing or invalid");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is unavailable");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Slack payload must be an object");
  }

  const response = await fetchImpl(webhookUrl.trim(), {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const responseBody = await response.text();
  if (!response.ok || responseBody.trim() !== "ok") {
    const detail = responseBody.trim().slice(0, 200);
    throw new Error(`Slack webhook failed: HTTP ${response.status} ${detail}`);
  }
  return responseBody.trim();
}

function formatExchangeBlock(snapshot) {
  return [
    `*${snapshot.name}* \`${snapshot.symbol}\``,
    "```",
    "ASK / BUY",
    TABLE_HEADER,
    ...orderedRows(snapshot.buy, DISPLAY_TARGETS.askBuy),
    formatBestRow(snapshot.bestAsk, snapshot.mid),
    MID_SEPARATOR,
    formatMidLine(snapshot),
    MID_SEPARATOR,
    formatBestRow(snapshot.bestBid, snapshot.mid),
    ...orderedRows(snapshot.sell, DISPLAY_TARGETS.bidSell),
    TABLE_HEADER,
    "BID / SELL",
    "```",
  ].join("\n");
}

function orderedRows(results, targetOrder) {
  const byTarget = new Map(results.map((result) => [result.target, result]));
  return targetOrder.map((target) => {
    const result = byTarget.get(target);
    if (!result) {
      throw new Error(`Depth result for ${target} BTC is missing`);
    }
    return formatSlackRow(result);
  });
}

function formatSlackRow(result) {
  const quantity = padDisplayStart(result.target, COLUMN_WIDTHS.quantity);
  if (result.insufficient) {
    return `${quantity} | 板不足（取得範囲 ${result.available.toFixed(4)} BTC）`;
  }
  return formatTableColumns(
    result.target,
    formatPrice(result.limit),
    formatImpactPercent(result.limitImpactPercent),
  );
}

function formatBestRow(price, mid) {
  return formatTableColumns(
    "best",
    formatPrice(price),
    formatImpactPercent(Math.abs((price / mid) - 1) * 100),
  );
}

function formatMidLine({ bestAsk, bestBid, mid }) {
  const spread = bestAsk - bestBid;
  const spreadPercent = spread / mid * 100;
  return `MID ${formatPrice(mid, 1)}（SP ${formatPrice(spread)}／${
    formatImpactPercent(spreadPercent)
  }）`;
}

function formatImpactPercent(percent) {
  return `${percent.toFixed(4)}%`;
}

function formatTableColumns(quantity, limit, impact) {
  return [
    padDisplayStart(quantity, COLUMN_WIDTHS.quantity),
    padDisplayStart(limit, COLUMN_WIDTHS.limit),
    padDisplayStart(impact, COLUMN_WIDTHS.impact),
  ].join(" | ");
}

function padDisplayStart(value, targetWidth) {
  const text = String(value);
  const paddingWidth = Math.max(
    0,
    Math.round(targetWidth - displayWidth(text)),
  );
  return `${" ".repeat(paddingWidth)}${text}`;
}

function displayWidth(value) {
  return [...String(value)].reduce((width, character) => (
    width + (isWideCharacter(character) ? SLACK_WIDE_CHARACTER_WIDTH : 1)
  ), 0);
}

function isWideCharacter(character) {
  return /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/u
    .test(character);
}
