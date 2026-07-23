import {
  DISPLAY_TARGETS,
  RUNTIME_DEFAULTS,
} from "./config.mjs";

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

export function createSlackText(snapshots, fetchedAtJst) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error("At least one exchange snapshot is required");
  }

  const blocks = snapshots.map(formatExchangeBlock);
  return [
    "*レバBTC 板Depthスナップショット*",
    `取得時刻: ${fetchedAtJst} JST`,
    "価格影響 = mid（best askとbest bidの中間値）からの到達価格・VWAPの距離",
    "手数料・スプレッド外コストは除外",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

export async function postToSlack(text, webhookUrl, {
  fetchImpl = globalThis.fetch,
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
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
  const sourceTime = snapshot.sourceTime
    ? ` / API応答時刻 ${snapshot.sourceTime}`
    : "";
  return [
    `*${snapshot.name}* \`${snapshot.symbol}\`${sourceTime}`,
    "```",
    "数量 |     到達価格 | 到達影響(%) |           VWAP | VWAP影響(%)",
    "ASK / BUY",
    ...orderedRows(snapshot.buy, DISPLAY_TARGETS.askBuy),
    `──────── MID ${formatPrice(snapshot.mid, 1)} ────────`,
    "BID / SELL",
    ...orderedRows(snapshot.sell, DISPLAY_TARGETS.bidSell),
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
  const quantity = String(result.target).padStart(3);
  if (result.insufficient) {
    return `${quantity} | 板不足（取得範囲 ${result.available.toFixed(4)} BTC）`;
  }
  return [
    quantity,
    formatPrice(result.limit).padStart(12),
    formatImpactPercent(result.limitImpactPercent).padStart(11),
    formatPrice(result.vwap, 1).padStart(14),
    formatImpactPercent(result.vwapImpactPercent).padStart(11),
  ].join(" | ");
}

function formatImpactPercent(percent) {
  return `${percent.toFixed(4)}%`;
}
